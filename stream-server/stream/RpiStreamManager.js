import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { createInterface } from 'node:readline';
import { messagingApi } from '@line/bot-sdk';
import {
    RECORDINGS_DIR,
    THUMBNAILS_DIR,
    IMAGES_DIR,
    PYTHON_EXEC,
    PYTHON_SCRIPT,
    HOSTNAME,
    SOI,
    EOI
} from '../utils/constants.js';

// Ensure directories exist
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// LINE Client
const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

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

export class RpiStreamManager {
    constructor() {
        this.rpiProcess = null;
        this.ffmpegProcess = null;
        this.clients = new Set();
        this.isStreaming = false;
        this.mode = 'continuous';
        this.currentFrame = null;
        this.detectionEnabled = true;

        this.pythonProcess = null;
        this.detectionBuffer = Buffer.alloc(0);
        this.lastFrameTime = 0;

        this.catTracker = new StateTracker('cat', 2000);
        this.personTracker = new StateTracker('person', 2000);

        setInterval(() => {
            this.rotateRecordings();
            this.ensureThumbnails();
        }, 60 * 1000);

        this.startStreamIfNeeded();
    }

    startDetection() {
        if (this.pythonProcess) return;

        console.log('Starting Python Detection Service...');
        try {
            this.pythonProcess = spawn(PYTHON_EXEC, [PYTHON_SCRIPT]);
            const rl = createInterface({ input: this.pythonProcess.stdout });

            rl.on('line', (line) => {
                try {
                    const data = JSON.parse(line);
                    if (data.detections !== undefined) {
                        const hasCat = data.detections.some(d => d.label === 'cat');
                        const hasPerson = data.detections.some(d => d.label === 'person');

                        if (this.catTracker.update(hasCat)) {
                            if (this.catTracker.isPresent) {
                                console.log('Cat Detected! Capturing frame...');
                                this.saveCatCapture();
                            }
                        }
                        this.personTracker.update(hasPerson);
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
        if (!this.detectionEnabled) return;
        const now = Date.now();
        if (now - this.lastFrameTime < 1000) return;

        this.lastFrameTime = now;
        try {
            const header = Buffer.alloc(4);
            header.writeUInt32BE(frame.length, 0);
            this.pythonProcess.stdin.write(header);
            this.pythonProcess.stdin.write(frame);
        } catch (e) {
            console.error('Error writing to python:', e);
            this.pythonProcess = null;
        }
    }

    ensureThumbnails() {
        fs.readdir(RECORDINGS_DIR, (err, files) => {
            if (err) return;
            files.filter(f => f.endsWith('.mp4')).forEach(mp4 => {
                const jpg = mp4.replace('.mp4', '.jpg');
                const jpgPath = path.join(THUMBNAILS_DIR, jpg);
                if (!fs.existsSync(jpgPath)) {
                    const mp4Path = path.join(RECORDINGS_DIR, mp4);
                    const ffmpeg = spawn('ffmpeg', [
                        '-y', '-i', mp4Path, '-ss', '00:00:01', '-vframes', '1', jpgPath
                    ]);
                    ffmpeg.on('error', (err) => console.error('Thumbnail generation error:', err));
                    ffmpeg.on('exit', (code) => {
                        if (code !== 183 && code !== 0) console.error(`Failed to generate thumbnail for ${mp4} (code ${code})`);
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
            if (this.isStreaming && !this.ffmpegProcess) {
                this.startRecording();
            }
        } else {
            this.stopRecording();
            this.stopStreamIfNoClients();
        }
        return true;
    }

    setDetection(enabled) {
        this.detectionEnabled = !!enabled;
        console.log(`Detection enabled: ${this.detectionEnabled}`);
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
        const shouldStart = (this.mode === 'continuous') || (this.clients.size > 0);
        if (!shouldStart) return;
        if (this.isStreaming || this.rpiProcess) return;

        console.log('Starting Pi Camera stream...');
        this.isStreaming = true;
        this.startDetection();

        this.rpiProcess = spawn('rpicam-vid', [
            '--inline', '-t', '0', '--width', '1280', '--height', '720',
            '--framerate', '15', '--codec', 'mjpeg', '-o', '-'
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
            this.stopRecording();
        });

        let buffer = Buffer.alloc(0);
        this.rpiProcess.stdout.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            let offset = 0;
            while (true) {
                const start = buffer.indexOf(SOI, offset);
                if (start === -1) break;
                const end = buffer.indexOf(EOI, start + 2);
                if (end === -1) break;

                const frame = buffer.subarray(start, end + 2);
                this.broadcast(frame);
                this.sendFrameToPython(frame);
                offset = end + 2;
            }
            if (offset > 0) buffer = buffer.subarray(offset);
        });
    }

    startRecording() {
        if (this.ffmpegProcess) return;
        if (!this.rpiProcess) return;

        console.log('Starting recording...');
        const args = [
            '-f', 'mjpeg', '-framerate', '15', '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast',
            '-f', 'segment', '-segment_time', '300', '-reset_timestamps', '1', '-strftime', '1',
            path.join(RECORDINGS_DIR, '%Y%m%d-%H%M%S.mp4')
        ];

        this.ffmpegProcess = spawn('ffmpeg', args);
        this.rpiProcess.stdout.pipe(this.ffmpegProcess.stdin);

        this.ffmpegProcess.on('error', (err) => console.error('ffmpeg error:', err));
        this.ffmpegProcess.on('exit', (code) => {
            console.log(`ffmpeg exited with code ${code}`);
            this.ffmpegProcess = null;
        });

        this.rotateRecordings();
    }

    stopRecording() {
        if (this.ffmpegProcess) {
            console.log('Stopping recording...');
            const proc = this.ffmpegProcess;
            this.ffmpegProcess = null;
            if (this.rpiProcess) this.rpiProcess.stdout.unpipe(proc.stdin);
            proc.kill('SIGTERM');

            return new Promise(resolve => {
                const handler = () => {
                    console.log('Recording process exited cleanly.');
                    resolve();
                };
                proc.once('exit', handler);
                setTimeout(() => {
                    proc.off('exit', handler);
                    resolve();
                }, 2000);
            });
        }
        return Promise.resolve();
    }

    stopStreamIfNoClients() {
        if (this.mode === 'continuous') return;
        if (this.clients.size === 0 && this.rpiProcess) {
            console.log('No clients left. Stopping stream...');
            this.forceStop();
        }
    }

    forceStop() {
        const p = this.stopRecording();
        if (this.rpiProcess) {
            this.rpiProcess.kill('SIGKILL');
            this.rpiProcess = null;
        }
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
                mp4s.slice(0, mp4s.length - 36).forEach(f => {
                    fs.unlink(path.join(RECORDINGS_DIR, f), (err) => {
                        if (!err) {
                            console.log(`Deleted old recording: ${f}`);
                            fs.unlink(path.join(THUMBNAILS_DIR, f.replace('.mp4', '.jpg')), () => { });
                        }
                    });
                });
            }
        });
    }

    broadcast(data) {
        this.currentFrame = data;
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(data);
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
        const timestamp = `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
        const filename = `${timestamp}.jpg`;
        const catPath = path.join(IMAGES_DIR, filename);

        fs.writeFile(catPath, this.currentFrame, (err) => {
            if (err) {
                console.error(`Failed to save ${filename}:`, err);
                return;
            }
            console.log(`Saved images/${filename}`);

            const messages = [
                { type: 'text', text: '發現麻嚕!!' },
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
