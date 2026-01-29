require('dotenv').config();
const WebSocket = require('ws');
const line = require('@line/bot-sdk');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');


// create LINE SDK config from env variables
const config = {
    channelSecret: process.env.CHANNEL_SECRET,
};

// create LINE SDK client
const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

const HOSTNAME = process.env.PUBLIC_HOSTNAME || 'localhost:3000';
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
const IMAGES_DIR = path.join(__dirname, 'images');
const PYTHON_EXEC = path.join(__dirname, '../image-server/venv/bin/python');
const PYTHON_SCRIPT = path.join(__dirname, '../image-server/video_processor.py');
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// Ensure directories exist
if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}
if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
}
if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

class StateTracker {
    constructor(label, delayMs = 2000) {
        this.label = label;
        this.delayMs = delayMs;
        this.isPresent = false;
        this.potentialState = false;
        this.firstTransitionTime = 0;
    }

    update(isDetected) {
        if (isDetected !== this.potentialState) {
            this.potentialState = isDetected;
            this.firstTransitionTime = Date.now();
        } else if (this.potentialState !== this.isPresent) {
            if (Date.now() - this.firstTransitionTime >= this.delayMs) {
                this.isPresent = this.potentialState;
                console.log(`State Update: ${this.label}Present = ${this.isPresent}`);
                return true;
            }
        }
        return false;
    }
}

// singleton class to manage the stream process and connected clients
class StreamManager {
    constructor() {
        this.rpiProcess = null;
        this.ffmpegProcess = null;
        this.clients = new Set(); // Set of WebSocket clients that want the stream
        this.isStreaming = false;
        this.mode = 'continuous'; // 'on-demand' or 'continuous'
        this.currentFrame = null;
        this.detectionEnabled = true; // Default to enabled

        // Python Detection
        this.pythonProcess = null;
        this.detectionBuffer = Buffer.alloc(0);
        this.lastFrameTime = 0;

        // Presence Trackers
        this.catTracker = new StateTracker('cat', 2000);
        this.personTracker = new StateTracker('person', 2000);

        // Check for retention and thumbnails every minute
        setInterval(() => {
            this.rotateRecordings();
            this.ensureThumbnails();
        }, 60 * 1000);

        // Auto-start if in continuous mode
        this.startStreamIfNeeded();
    }

    startDetection() {
        if (this.pythonProcess) return;

        console.log('Starting Python Detection Service...');
        try {
            this.pythonProcess = spawn(PYTHON_EXEC, [PYTHON_SCRIPT]);

            // Handle Output (JSON Logs)
            const readline = require('readline');
            const rl = readline.createInterface({ input: this.pythonProcess.stdout });

            rl.on('line', (line) => {
                try {
                    const data = JSON.parse(line);
                    if (data.detections !== undefined) {
                        // Track Presence
                        const hasCat = data.detections.some(d => d.label === 'cat');
                        const hasPerson = data.detections.some(d => d.label === 'person');

                        if (this.catTracker.update(hasCat)) {
                            // State changed
                            if (this.catTracker.isPresent) {
                                console.log('Cat Detected! Capturing frame...');
                                this.saveCatCapture();
                            }
                        }
                        this.personTracker.update(hasPerson);

                        // Only log specific detections if needed, or rely on state logs
                        if (data.detections.length > 0) {
                            // console.log('Object Detected:', JSON.stringify(data.detections));
                        }
                    }
                } catch (e) {
                    console.log('Python:', line);
                }
            });

            this.pythonProcess.stderr.on('data', d => console.error('Python Error:', d.toString()));
            this.pythonProcess.on('exit', () => {
                this.pythonProcess = null;
                console.log('Python detection stopped');
            });
        } catch (error) {
            console.error('Failed to spawn python process:', error);
        }
    }



    sendFrameToPython(frame) {
        if (!this.detectionEnabled) return; // Skip if disabled

        const now = Date.now();
        // Rate limit: 1000ms = 1fps (Reduced to save CPU)
        if (now - this.lastFrameTime < 1000) return;

        this.lastFrameTime = now;

        try {
            // Protocol: 4-byte Big Endian Length + JPEG Bytes
            const header = Buffer.alloc(4);
            header.writeUInt32BE(frame.length, 0);
            this.pythonProcess.stdin.write(header);
            this.pythonProcess.stdin.write(frame);
        } catch (e) {
            console.error('Error writing to python:', e);
            this.pythonProcess = null; // Reset if pipe broken
        }
    }

    ensureThumbnails() {
        fs.readdir(RECORDINGS_DIR, (err, files) => {
            if (err) return;
            files.filter(f => f.endsWith('.mp4')).forEach(mp4 => {
                const jpg = mp4.replace('.mp4', '.jpg');
                const jpgPath = path.join(THUMBNAILS_DIR, jpg);
                if (!fs.existsSync(jpgPath)) {
                    // console.log(`Generating thumbnail for ${mp4}...`);
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

    setDetection(enabled) {
        this.detectionEnabled = !!enabled;
        console.log(`Detection enabled: ${this.detectionEnabled}`);
        // If disabled, we might want to reset trackers? 
        // For now, let's leave them, they will naturally expire or just stay stale (but safe).
        if (!this.detectionEnabled) {
            // Optional: clear state?
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

        // Start Python Detection
        this.startDetection();

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
                const start = buffer.indexOf(SOI, offset);
                if (start === -1) break;

                // 0xFF, 0xD9 is the End of Image (EOI) marker for JPEG
                const end = buffer.indexOf(EOI, start + 2);
                if (end === -1) break;

                const frame = buffer.subarray(start, end + 2);

                // Broadcast frame to all connected clients
                this.broadcast(frame);

                // Send to Python for detection
                this.sendFrameToPython(frame);

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
        // Note: '-f segment' with '-segment_time 300' tells ffmpeg to automatically
        // split the recording into separate 5-minute files indefinitely.
        // The process runs continuously until stopped.
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
            const proc = this.ffmpegProcess;
            this.ffmpegProcess = null;

            // Unpipe to allow clean exit mechanism for ffmpeg
            if (this.rpiProcess) {
                this.rpiProcess.stdout.unpipe(proc.stdin);
            }

            // SIGTERM allows ffmpeg to write trailer and exit cleanly
            proc.kill('SIGTERM');

            return new Promise(resolve => {
                const handler = () => {
                    console.log('Recording process exited cleanly.');
                    resolve();
                };
                proc.once('exit', handler);
                // Safety timeout in case it hangs
                setTimeout(() => {
                    console.log('Recording process stop timeout.');
                    proc.off('exit', handler);
                    resolve();
                }, 2000);
            });
        }
        return Promise.resolve();
    }

    stopStreamIfNoClients() {
        if (this.mode === 'continuous') return; // Never stop in continuous mode

        if (this.clients.size === 0 && this.rpiProcess) {
            console.log('No clients left. Stopping stream...');
            this.forceStop();
        }
    }

    forceStop() {
        // Return promise to allow waiting for recording to close
        const p = this.stopRecording();
        if (this.rpiProcess) {
            this.rpiProcess.kill('SIGKILL');
            this.rpiProcess = null;
        }

        // Stop Python
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.isStreaming = false;
        return p;
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
                            const thumbPath = path.join(THUMBNAILS_DIR, f.replace('.mp4', '.jpg'));
                            fs.unlink(thumbPath, () => { });
                        }
                    });
                });
            }
        });
    }

    broadcast(data) {
        this.currentFrame = data;
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        }
    }

    saveCatCapture() {
        if (!this.currentFrame) return;

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        // Format: YYYYMMDD-HHMMSS
        const timestamp = `${yyyy}${mm}${dd}-${hh}${min}${ss}`;

        const filename = `${timestamp}.jpg`;
        const catPath = path.join(IMAGES_DIR, filename);

        // Save Raw Frame
        fs.writeFile(catPath, this.currentFrame, (err) => {
            if (err) {
                console.error(`Failed to save ${filename}:`, err);
                return;
            }
            console.log(`Saved images/${filename}`);

            // Send Line Alert
            const messages = [
                {
                    type: 'text',
                    text: '發現麻嚕!!'
                },
                {
                    type: 'image',
                    originalContentUrl: `https://${HOSTNAME}/images/${filename}`,
                    previewImageUrl: `https://${HOSTNAME}/images/${filename}`
                }
            ];

            client.broadcast({ messages })
                .then(() => console.log('Line broadcast sent'))
                .catch((err) => console.error('Line broadcast failed:', err));
        });
    }
}

class EspStreamManager {
    constructor(url) {
        this.url = url;
        this.currentFrame = null;
        this.clients = new Set();
        this.request = null;
        this.retryTimeout = null;

        // Start connection
        this.connect();
    }

    connect() {
        console.log(`Connecting to ESP32 stream at ${this.url}...`);
        this.request = http.get(this.url, (res) => {
            console.log(`ESP32 Connected. Status: ${res.statusCode}`);

            let buffer = Buffer.alloc(0);
            const boundary = '--123456789000000000000987654321'; // Standard ESP32/OV2640 boundary

            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);

                // Find start and end of JPEG
                let offset = 0;
                while (true) {
                    const start = buffer.indexOf(SOI, offset);
                    if (start === -1) break;

                    const end = buffer.indexOf(EOI, start + 2);
                    if (end === -1) break;

                    // Extract full JPEG Frame
                    const frame = buffer.subarray(start, end + 2);
                    this.currentFrame = frame;
                    this.broadcast(frame);

                    offset = end + 2;
                }

                if (offset > 0) {
                    buffer = buffer.subarray(offset);
                }
            });

            res.on('end', () => {
                console.log('ESP32 Stream ended. Reconnecting...');
                this.scheduleReconnect();
            });

        }).on('error', (err) => {
            console.error('ESP32 Connection Error:', err.message);
            this.scheduleReconnect();
        });
    }

    scheduleReconnect() {
        if (this.retryTimeout) clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.connect(), 5000);
    }

    addClient(ws) {

        if (!this.clients.has(ws)) {
            this.clients.add(ws);
            console.log(`ESP32 Viewer added. Total: ${this.clients.size}`);

            // Send current frame immediately if possible
            if (this.currentFrame && ws.readyState === WebSocket.OPEN) {
                this.sendFrameToClient(ws, this.currentFrame);
            }
        }
    }

    removeClient(ws) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            console.log(`ESP32 Viewer removed. Total: ${this.clients.size}`);
        }
    }

    broadcast(frame) {
        for (const client of this.clients) {
            this.sendFrameToClient(client, frame);
        }
    }

    sendFrameToClient(ws, frame) {
        try {
            ws.send(frame, (err) => {
                if (err) console.error('ESP32 WS send error:', err);
            });
        } catch (e) {
            console.error('ESP32 WS broadcast exception:', e);
            this.removeClient(ws);
        }
    }
}

const streamManager = new StreamManager();
const espStreamManager = new EspStreamManager('http://192.168.1.114/stream');

const app = express();
const server = http.createServer(app);

// Global Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, Authorization');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// JSON Body Parser for Settings
app.use(express.json());

// --- AUTHENTICATION MIDDLEWARE ---
const protect = (req, res, next) => {
    const PASSWORD = process.env.PASSWORD;
    if (!PASSWORD) return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// --- PUBLIC ROUTES ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// --- PROTECTED ROUTES ---
// Apply protection to all API routes and Static files
app.use('/api', protect);
app.use('/recordings', protect);
app.use('/thumbnails', protect);
app.use('/images', protect);

// API: System Stats
app.get('/api/stats', (req, res) => {
    const getCpuTemperature = () => {
        try {
            const temp = fs.readFileSync("/sys/class/thermal/thermal_zone0/temp", "utf8");
            return (parseInt(temp) / 1000).toFixed(1);
        } catch (e) {
            return "N/A";
        }
    };

    const getCpuUsage = () => {
        const cpus = os.cpus();
        if (!cpus || cpus.length === 0) return "0.0";
        const loadAvg = os.loadavg()[0];
        const usagePercent = (loadAvg / cpus.length) * 100;
        return Math.min(usagePercent, 100).toFixed(1);
    };

    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const usedMem = (parseFloat(totalMem) - parseFloat(freeMem)).toFixed(2);
    const memUsagePercent = ((parseFloat(usedMem) / parseFloat(totalMem)) * 100).toFixed(1);

    res.json({
        hostname: os.hostname(),
        totalMem,
        usedMem,
        memUsagePercent,
        cpuTemp: getCpuTemperature(),
        cpuUsage: getCpuUsage(),
        uptime: (os.uptime() / 3600).toFixed(1)
    });
});

// API: List Replays
app.get('/api/replays', (req, res) => {
    fs.readdir(RECORDINGS_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read recordings' });

        const recordings = files
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const thumbName = f.replace('.mp4', '.jpg');
                const hasThumb = fs.existsSync(path.join(THUMBNAILS_DIR, thumbName));
                return {
                    filename: f,
                    url: `/recordings/${f}`,
                    thumbnailUrl: hasThumb ? `/thumbnails/${thumbName}` : null
                };
            })
            .sort((a, b) => b.filename.localeCompare(a.filename));

        res.json(recordings);
    });
});

// API: List Images
app.get('/api/images', (req, res) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    fs.readdir(IMAGES_DIR, (err, files) => {
        if (err) return res.json(page ? { images: [], total: 0 } : []);

        let allImages = files
            .filter(f => f.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a));

        if (!isNaN(page) && !isNaN(limit)) {
            const total = allImages.length;
            const totalPages = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            const sliced = allImages.slice(startIndex, startIndex + limit).map(f => ({
                filename: f,
                url: `/images/${f}`
            }));

            res.json({
                images: sliced,
                total,
                page,
                totalPages
            });
        } else {
            const sliced = allImages.slice(0, 5).map(f => ({
                filename: f,
                url: `/images/${f}`
            }));
            res.json(sliced);
        }
    });
});

// API: Settings
app.get('/api/settings', (req, res) => {
    res.json({
        mode: streamManager.mode,
        detectionEnabled: streamManager.detectionEnabled
    });
});

app.post('/api/settings', (req, res) => {
    const { mode, detectionEnabled } = req.body;
    let updated = false;

    if (mode !== undefined) {
        if (streamManager.setMode(mode)) updated = true;
    }
    if (detectionEnabled !== undefined) {
        if (streamManager.setDetection(detectionEnabled)) updated = true;
    }

    if (updated) {
        res.json({
            status: 'updated',
            mode: streamManager.mode,
            detectionEnabled: streamManager.detectionEnabled
        });
    } else {
        res.status(400).json({ error: 'Invalid settings' });
    }
});

// Static Files (Protected)
app.use('/recordings', express.static(RECORDINGS_DIR));
app.use('/thumbnails', express.static(THUMBNAILS_DIR, { maxAge: '1h' }));
app.use('/images', express.static(IMAGES_DIR));

// Fallback
app.use((req, res) => {
    res.status(404).send('Not Found');
});


// --- WEBSOCKET SERVER ---
const wss = new WebSocket.Server({ noServer: true });
const wssEsp = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const { pathname } = require('url').parse(request.url);

    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else if (pathname === '/ws/esp32') {
        wssEsp.handleUpgrade(request, socket, head, (ws) => {
            wssEsp.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    console.log('RPi Client connected');
    ws.on('message', (message) => {
        const msg = message.toString();
        if (msg === 'start') streamManager.addClient(ws);
        else if (msg === 'stop') streamManager.removeClient(ws);
    });
    ws.on('close', () => {
        console.log('RPi Client disconnected');
        streamManager.removeClient(ws);
    });
});

wssEsp.on('connection', (ws) => {
    console.log('ESP32 Client connected');
    ws.on('message', (message) => {
        const msg = message.toString();
        if (msg === 'start') espStreamManager.addClient(ws);
        else if (msg === 'stop') espStreamManager.removeClient(ws);
    });
    ws.on('close', () => {
        console.log('ESP32 Client disconnected');
        espStreamManager.removeClient(ws);
    });
});

server.listen(8080, () => {
    console.log('Express Server listening on port 8080');
});

// Robust cleanup
const cleanup = async () => {
    console.log('Server shutting down...');
    server.close();
    wss.close();
    wssEsp.close();
    await streamManager.forceStop();
    console.log('Cleanup complete. Exiting.');
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
