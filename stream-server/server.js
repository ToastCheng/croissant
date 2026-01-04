const WebSocket = require('ws');
const ffmpeg = require('fluent-ffmpeg');
const http = require('http');
const path = require('path');
const fs = require('fs');

const wss = new WebSocket.Server({ port: 8080 });

const VIDEO_PATH = path.join(__dirname, 'maru.mp4'); // Ensure this file exists

console.log('WebSocket server starting on port 8080');

// Create a dummy video file if it doesn't exist (using ffmpeg logic or manual)
// For simplicity, we assume the user will provide one, or we can generate a simple one.
// Let's proceed assuming the user has or we will generate a 'test_video.mp4' later.

wss.on('connection', (ws) => {
    console.log('Client connected');
    let ffmpegCommand = null;

    ws.on('message', (message) => {
        const msg = message.toString();
        console.log('Received:', msg);

        if (msg === 'start') {
            if (ffmpegCommand) return; // Already running

            console.log('Starting stream...');

            // Stream MJPEG
            ffmpegCommand = ffmpeg(VIDEO_PATH)
                .inputOptions(['-stream_loop', '-1']) // Loop indefinitely
                .format('mjpeg')
                .videoCodec('mjpeg') // Use MJPEG codec
                .outputOptions([
                    '-f', 'image2pipe', // Output raw image data
                    '-vcodec', 'mjpeg',
                    '-q:v', '2', // Quality
                    '-r', '30', // Frame rate
                ])
                .on('error', (err) => {
                    console.error('FFmpeg error:', err.message);
                    // Don't kill the socket, just stop the command reference
                    ffmpegCommand = null;
                })
                .on('end', () => {
                    console.log('Stream ended');
                    ffmpegCommand = null;
                });

            const stream = ffmpegCommand.pipe();

            let buffer = Buffer.alloc(0);

            stream.on('data', (chunk) => {
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
            if (ffmpegCommand) {
                console.log('Stopping stream...');
                ffmpegCommand.kill('SIGKILL');
                ffmpegCommand = null;
            }
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (ffmpegCommand) {
            ffmpegCommand.kill('SIGKILL');
            ffmpegCommand = null;
        }
    });
});

// Helper: Basic robust JPEG frame parser is tricky in simple node script without deps.
// We will refine the server if the crude fluid pipe doesn't work well on client.
