const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RECORDINGS_DIR = path.join(__dirname, 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// singleton class to manage the stream process and connected clients
class StreamManager {
    constructor() {
        this.rpiProcess = null;
        this.ffmpegProcess = null;
        this.clients = new Set(); // Set of WebSocket clients that want the stream
        this.isStreaming = false;
        this.mode = 'on-demand'; // 'on-demand' or 'continuous'

        // Check for retention and thumbnails every minute
        setInterval(() => {
            this.rotateRecordings();
            this.ensureThumbnails();
        }, 60 * 1000);
    }

    ensureThumbnails() {
        fs.readdir(RECORDINGS_DIR, (err, files) => {
            if (err) return;
            files.filter(f => f.endsWith('.mp4')).forEach(mp4 => {
                const jpg = mp4.replace('.mp4', '.jpg');
                const jpgPath = path.join(RECORDINGS_DIR, jpg);
                if (!fs.existsSync(jpgPath)) {
                    console.log(`Generating thumbnail for ${mp4}...`);
                    const mp4Path = path.join(RECORDINGS_DIR, mp4);
                    // generate thumbnail at 1s mark
                    const ffmpeg = spawn('ffmpeg', [
                        '-y',
                        '-i', mp4Path,
                        '-ss', '00:00:01',
                        '-vframes', '1',
                        jpgPath
                    ]);
                    ffmpeg.on('error', (err) => console.error('Thumbnail generation error:', err));
                    ffmpeg.on('exit', (code) => {
                        if (code === 183) return; // already exists
                        if (code !== 0) console.error(`Failed to generate thumbnail for ${mp4} (code ${code})`);
                    });
                }
            });
        });
    }

    setMode(mode) {
        if (mode !== 'on-demand' && mode !== 'continuous') return false;
        console.log(`Switching mode to: ${mode}`);
        this.mode = mode;

        if (this.mode === 'continuous') {
            this.startStreamIfNeeded();
            // If already streaming but not recording (e.g. was on-demand), start recording now
            if (this.isStreaming && !this.ffmpegProcess) {
                this.startRecording();
            }
        } else {
            this.stopRecording(); // Stop recording when switching to on-demand
            this.stopStreamIfNoClients();
        }
        return true;
    }

    addClient(ws) {
        if (!this.clients.has(ws)) {
            this.clients.add(ws);
            console.log(`Client added. Total clients: ${this.clients.size}`);
            this.startStreamIfNeeded();
        }
    }

    removeClient(ws) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            console.log(`Client removed. Total clients: ${this.clients.size}`);
            this.stopStreamIfNoClients();
        }
    }

    startStreamIfNeeded() {
        // In continuous mode, we force start. In on-demand, we need at least 1 client.
        const shouldStart = (this.mode === 'continuous') || (this.clients.size > 0);

        if (!shouldStart) return;
        if (this.isStreaming || this.rpiProcess) return;

        console.log('Starting Pi Camera stream...');
        this.isStreaming = true;

        // Spawn rpicam-vid
        this.rpiProcess = spawn('rpicam-vid', [
            '--inline',
            '-t', '0',
            '--width', '1280',
            '--height', '720',
            '--framerate', '15',
            '--codec', 'mjpeg',
            '-o', '-'
        ]);

        if (this.mode === 'continuous') {
            this.startRecording();
        }

        this.rpiProcess.on('error', (err) => {
            console.error('rpicam-vid error:', err.message);
            this.forceStop();
        });

        this.rpiProcess.on('exit', (code, signal) => {
            console.log(`rpicam-vid exited with code ${code} and signal ${signal}`);
            this.rpiProcess = null;
            this.isStreaming = false;
            this.stopRecording(); // Ensure ffmpeg stops if camera stops
        });

        this.rpiProcess.stderr.on('data', (data) => {
            // console.debug(`rpicam-vid: ${data}`);
        });

        let buffer = Buffer.alloc(0);

        this.rpiProcess.stdout.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            let offset = 0;
            while (true) {
                // 0xFF, 0xD8 is the Start of Image (SOI) marker for JPEG
                const start = buffer.indexOf(Buffer.from([0xFF, 0xD8]), offset);
                if (start === -1) break;

                // 0xFF, 0xD9 is the End of Image (EOI) marker for JPEG
                const end = buffer.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
                if (end === -1) break;

                const frame = buffer.subarray(start, end + 2);

                // Broadcast frame to all connected clients
                this.broadcast(frame);

                offset = end + 2;
            }

            if (offset > 0) {
                buffer = buffer.subarray(offset);
            }
        });
    }

    startRecording() {
        if (this.ffmpegProcess) return;
        if (!this.rpiProcess) return;

        console.log('Starting recording...');

        // ffmpeg arguments
        const args = [
            '-f', 'mjpeg',
            '-framerate', '15',
            '-i', '-',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-f', 'segment',
            '-segment_time', '300', // 5 minutes
            '-reset_timestamps', '1',
            '-strftime', '1',
            path.join(RECORDINGS_DIR, '%Y%m%d-%H%M%S.mp4')
        ];

        this.ffmpegProcess = spawn('ffmpeg', args);

        // Pipe video stream
        this.rpiProcess.stdout.pipe(this.ffmpegProcess.stdin);

        this.ffmpegProcess.on('error', (err) => {
            console.error('ffmpeg error:', err);
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
            // console.log(`ffmpeg: ${data}`); // Verbose
        });

        this.ffmpegProcess.on('exit', (code, signal) => {
            console.log(`ffmpeg exited with code ${code}`);
            this.ffmpegProcess = null;
        });

        // Trigger rotation check immediately
        this.rotateRecordings();
    }

    stopRecording() {
        if (this.ffmpegProcess) {
            console.log('Stopping recording...');
            this.ffmpegProcess.kill('SIGTERM'); // SIGTERM allows ffmpeg to close file cleanly?
            // If piped input closes (which happens when rpiProcess dies), ffmpeg usually finishes.
            // But if we want to stop ONLY recording, we kill it.
            // Unpipe to prevent EPIPE errors on rpiProcess if we kill ffmpeg but keep camera?
            if (this.rpiProcess) {
                this.rpiProcess.stdout.unpipe(this.ffmpegProcess.stdin);
            }
            this.ffmpegProcess = null;
        }
    }

    stopStreamIfNoClients() {
        if (this.mode === 'continuous') return; // Never stop in continuous mode

        if (this.clients.size === 0 && this.rpiProcess) {
            console.log('No clients left. Stopping stream...');
            this.forceStop();
        }
    }

    forceStop() {
        this.stopRecording();
        if (this.rpiProcess) {
            this.rpiProcess.kill('SIGKILL');
            this.rpiProcess = null;
        }
        this.isStreaming = false;
    }

    rotateRecordings() {
        fs.readdir(RECORDINGS_DIR, (err, files) => {
            if (err) return;
            const mp4s = files.filter(f => f.endsWith('.mp4')).sort();
            if (mp4s.length > 36) {
                const toDelete = mp4s.slice(0, mp4s.length - 36);
                toDelete.forEach(f => {
                    const filePath = path.join(RECORDINGS_DIR, f);
                    fs.unlink(filePath, (err) => {
                        if (!err) {
                            console.log(`Deleted old recording: ${f}`);
                            // Delete thumbnail too
                            const thumbPath = filePath.replace('.mp4', '.jpg');
                            fs.unlink(thumbPath, () => { });
                        }
                    });
                });
            }
        });
    }

    broadcast(data) {
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
    }
}

const streamManager = new StreamManager();

const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
    }

    // API: List replays
    if (req.method === 'GET' && req.url === '/api/replays') {
        fs.readdir(RECORDINGS_DIR, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to read recordings' }));
                return;
            }
            const recordings = files
                .filter(f => f.endsWith('.mp4'))
                .map(f => ({
                    filename: f,
                    url: `/recordings/${f}`,
                    thumbnailUrl: `/thumbnails/${f.replace('.mp4', '.jpg')}`
                }))
                .sort((a, b) => b.filename.localeCompare(a.filename)); // Newest first

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(recordings));
        });
        return;
    }

    // Serve recordings and thumbnails
    if (req.method === 'GET' && (req.url.startsWith('/recordings/') || req.url.startsWith('/thumbnails/'))) {
        const filename = req.url.split('/')[2];
        const filePath = path.join(RECORDINGS_DIR, filename);

        // Security check: ensure path is inside recordings dir
        if (path.relative(RECORDINGS_DIR, filePath).startsWith('..')) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            const fileSize = stat.size;

            if (filename.endsWith('.jpg')) {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'image/jpeg'
                });
                fs.createReadStream(filePath).pipe(res);
                return;
            }

            const range = req.headers.range;

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                const chunksize = (end - start) + 1;
                const file = fs.createReadStream(filePath, { start, end });
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                };
                res.writeHead(200, head);
                fs.createReadStream(filePath).pipe(res);
            }
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
        return;
    }

    // Settings endpoint
    if (req.url === '/settings') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mode: streamManager.mode }));
            return;
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => {
                try {
                    const { mode } = JSON.parse(body);
                    if (streamManager.setMode(mode)) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'updated', mode: streamManager.mode }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid mode' }));
                    }
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }
    }

    // Default response
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Pi Camera Stream Server is running');
});

const wss = new WebSocket.Server({ server });

server.listen(8080, () => {
    console.log('HTTP/WebSocket server listening on port 8080');
});

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        const msg = message.toString();
        // console.log('Received:', msg); // Reduce noise

        if (msg === 'start') {
            streamManager.addClient(ws);
        } else if (msg === 'stop') {
            streamManager.removeClient(ws);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        streamManager.removeClient(ws);
    });
});

// Robust cleanup on server exit
const cleanup = () => {
    console.log('Server shutting down...');
    streamManager.forceStop();
    process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
