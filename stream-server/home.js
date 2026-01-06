const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');

const server = http.createServer((req, res) => {
    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
        return;
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
    let rpiProcess = null;

    ws.on('message', (message) => {
        const msg = message.toString();
        console.log('Received:', msg);

        if (msg === 'start') {
            if (rpiProcess) return; // Already running

            console.log('Starting Pi Camera stream...');

            // Spawn rpicam-vid
            // --inline: Insert inline headers (SPS, PPS) for restartability
            // -t 0: Run indefinitely
            // --width 1280 --height 720: Resolution
            // --codec mjpeg: Output MJPEG
            // -o -: Output to stdout
            rpiProcess = spawn('rpicam-vid', [
                '--inline',
                '-t', '0',
                '--width', '1280',
                '--height', '720',
                '--codec', 'mjpeg',
                '-o', '-'
            ]);

            rpiProcess.on('error', (err) => {
                console.error('rpicam-vid error:', err.message);
                rpiProcess = null;
            });

            rpiProcess.on('exit', (code, signal) => {
                console.log(`rpicam-vid exited with code ${code} and signal ${signal}`);
                rpiProcess = null;
            });

            rpiProcess.stderr.on('data', (data) => {
                // Log stderr from rpicam-vid for debugging
                console.error(`rpicam-vid: ${data}`);
            });

            let buffer = Buffer.alloc(0);

            rpiProcess.stdout.on('data', (chunk) => {
                if (ws.readyState === WebSocket.OPEN) {
                    buffer = Buffer.concat([buffer, chunk]);

                    let offset = 0;
                    while (true) {
                        const start = buffer.indexOf(Buffer.from([0xFF, 0xD8]), offset);
                        if (start === -1) break;

                        const end = buffer.indexOf(Buffer.from([0xFF, 0xD9]), start + 2);
                        if (end === -1) break;

                        const frame = buffer.subarray(start, end + 2);
                        ws.send(frame);

                        offset = end + 2;
                    }

                    if (offset > 0) {
                        buffer = buffer.subarray(offset);
                    }
                }
            });

        } else if (msg === 'stop') {
            if (rpiProcess) {
                console.log('Stopping stream...');
                rpiProcess.kill('SIGTERM'); // Try SIGTERM first
                rpiProcess = null;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (rpiProcess) {
            rpiProcess.kill('SIGTERM');
            rpiProcess = null;
        }
    });
});
