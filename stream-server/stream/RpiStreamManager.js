import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LineNotificationManager } from '../notification/LineNotificationManager.js';
import { StreamManager } from './StreamManager.js';
import {
    RECORDINGS_DIR,
    THUMBNAILS_DIR,
    IMAGES_DIR,
    HOSTNAME,
    SOI,
    EOI
} from '../utils/constants.js';
import logger from '../utils/logger.js';

// Ensure directories exist
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

export class RpiStreamManager extends StreamManager {
    constructor(recorder, notificationManager, detectionManager) {
        super(recorder);
        this.rpiProcess = null;
        this.isStreaming = false;
        this.mode = 'continuous';

        this.lastFrameReceivedTime = Date.now();

        this.notificationManager = notificationManager;
        this.detectionManager = detectionManager;

        // Listen for cat detection
        if (this.detectionManager) {
            this.detectionManager.on('detection', (data) => {
                if (data.source === 'rpi' && data.label === 'cat') {
                    logger.info('Cat Detected on RPi! Capturing frame...');
                    this.saveCatCapture();
                }
            });
        }

        // Watchdog: Check stream health every 5 seconds
        setInterval(() => this.checkStreamHealth(), 5000);

        this.startStreamIfNeeded();
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
        if (this.detectionManager) {
            this.detectionManager.setEnabled(enabled);
            return true;
        }
        return false;
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

        if (this.detectionManager) {
            this.detectionManager.start();
        }

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

                if (this.detectionManager) {
                    this.detectionManager.processFrame(frame);
                }

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

        if (this.detectionManager) {
            this.detectionManager.stop();
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
