const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');

// singleton class to manage the stream process and connected clients
class StreamManager {
    constructor() {
        this.rpiProcess = null;
        this.clients = new Set(); // Set of WebSocket clients that want the stream
        this.isStreaming = false;
        this.mode = 'on-demand'; // 'on-demand' or 'continuous'
    }

    setMode(mode) {
        if (mode !== 'on-demand' && mode !== 'continuous') return false;
        console.log(`Switching mode to: ${mode}`);
        this.mode = mode;

        if (this.mode === 'continuous') {
            this.startStreamIfNeeded();
        } else {
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

        this.rpiProcess.on('error', (err) => {
            console.error('rpicam-vid error:', err.message);
            this.forceStop();
        });

        this.rpiProcess.on('exit', (code, signal) => {
            console.log(`rpicam-vid exited with code ${code} and signal ${signal}`);
            this.rpiProcess = null;
            this.isStreaming = false;
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

    stopStreamIfNoClients() {
        if (this.mode === 'continuous') return; // Never stop in continuous mode

        if (this.clients.size === 0 && this.rpiProcess) {
            console.log('No clients left. Stopping stream...');
            this.forceStop();
        }
    }

    forceStop() {
        if (this.rpiProcess) {
            this.rpiProcess.kill('SIGKILL');
            this.rpiProcess = null;
        }
        this.isStreaming = false;
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
