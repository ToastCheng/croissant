import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { createInterface } from 'node:readline';
import { LineNotificationManager } from '../notification/LineNotificationManager.js';
import { StreamManager } from './StreamManager.js';
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
import logger from '../utils/logger.js';

// Ensure directories exist
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

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
                logger.info(`State Update: ${this.label}Present = ${this.isPresent}`);
                return true;
            }
        }
        return false;
    }
}

export class RpiStreamManager extends StreamManager {
    constructor(recorder, notificationManager) {
        super(recorder);
        this.rpiProcess = null;
        this.isStreaming = false;
        this.mode = 'continuous';
        this.detectionEnabled = true;

        this.pythonProcess = null;
        this.detectionBuffer = Buffer.alloc(0);
        this.lastFrameTime = 0;
        this.lastFrameReceivedTime = Date.now();

        this.catTracker = new StateTracker('cat', 2000);
        this.personTracker = new StateTracker('person', 2000);

        this.notificationManager = notificationManager;

        // Watchdog: Check stream health every 5 seconds
        setInterval(() => this.checkStreamHealth(), 5000);

        this.startStreamIfNeeded();
    }

    startDetection() {
        if (this.pythonProcess) return;

        logger.info('Starting Python Detection Service...');
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
                                logger.info('Cat Detected! Capturing frame...');
                                this.saveCatCapture();
                            }
                        }
                        this.personTracker.update(hasPerson);
                    }
                } catch (e) {
                    logger.info(`Python: ${line}`);
                }
            });

            this.pythonProcess.stderr.on('data', d => logger.error(`Python Error: ${d.toString()}`));
            this.pythonProcess.on('exit', () => {
                this.pythonProcess = null;
                logger.info('Python detection stopped');
            });
        } catch (error) {
            logger.error(`Failed to spawn python process: ${error}`);
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

    setMode(mode) {
        if (!super.setMode(mode)) return false;

        if (this.mode === 'continuous') {
            this.startStreamIfNeeded();
            if (this.isStreaming && this.rpiProcess) {
                this.startRecording(this.rpiProcess.stdout);
            }
        } else {
            this.stopRecording(this.rpiProcess ? this.rpiProcess.stdout : null);
            this.stopStreamIfNoClients();
        }
        return true;
    }

    setDetection(enabled) {
        this.detectionEnabled = !!enabled;
        logger.info(`Detection enabled: ${this.detectionEnabled}`);
        return true;
    }

    addClient(ws) {
        super.addClient(ws);
        this.startStreamIfNeeded();
    }

    removeClient(ws) {
        super.removeClient(ws);
        this.stopStreamIfNoClients();
    }

    startStreamIfNeeded() {
        logger.info(`startStreamIfNeeded mode=${this.mode} clients=${this.clients.size} streaming=${this.isStreaming} rpiProcess=${this.rpiProcess ? 'running' : 'not running'}`);
        const shouldStart = (this.mode === 'continuous') || (this.clients.size > 0);
        if (!shouldStart) return;
        if (this.isStreaming || this.rpiProcess) return;

        logger.info('Starting Pi Camera stream...');
        this.isStreaming = true;
        this.startDetection();

        // Added --verbose 1 to get more debug info
        this.rpiProcess = spawn('rpicam-vid', [
            '--inline', '-t', '0', '--width', '1280', '--height', '720',
            '--framerate', '15', '--codec', 'mjpeg', '-o', '-',
            // '--verbose', '1'
        ]);

        if (this.mode === 'continuous') {
            this.startRecording(this.rpiProcess.stdout);
        }

        this.rpiProcess.on('error', (err) => {
            logger.error(`rpicam-vid error: ${err.message}`);
            this.forceStop();
        });

        this.rpiProcess.on('exit', (code, signal) => {
            logger.info(`rpicam-vid exited with code ${code} and signal ${signal}`);
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
                this.lastFrameReceivedTime = Date.now();
                this.broadcast(frame);
                this.sendFrameToPython(frame);
                offset = end + 2;
            }
            if (offset > 0) buffer = buffer.subarray(offset);
        });
    }

    stopStreamIfNoClients() {
        if (this.mode === 'continuous') return;
        if (this.clients.size === 0 && this.rpiProcess) {
            logger.info('No clients left. Stopping stream...');
            this.forceStop();
        }
    }

    forceStop() {
        const p = this.stopRecording(this.rpiProcess ? this.rpiProcess.stdout : null);
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

    checkStreamHealth() {
        if (!this.isStreaming) return;
        // If no frames for 10 seconds, restart
        if (Date.now() - this.lastFrameReceivedTime > 10000) {
            logger.error('Watchdog: Stream stalled (no frames for 10s). Restarting...');
            this.forceStop().then(() => this.startStreamIfNeeded());
            this.lastFrameReceivedTime = Date.now(); // Reset to prevent double-trigger
        }
    }

    // broadcast inherited

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
                logger.error(`Failed to save ${filename}: ${err}`);
                return;
            }
            logger.info(`Saved images/${filename}`);

            const imageUrl = `https://${HOSTNAME}/images/${filename}`;
            this.notificationManager.send(
                'Cat Detected',
                '發現麻嚕!!',
                { imageUrl }
            );
        });
    }
}
