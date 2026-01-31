import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import {
    SOI,
    EOI,
    IMAGES_DIR,
    HOSTNAME
} from '../utils/constants.js';
import { StreamManager } from './StreamManager.js';
import logger from '../utils/logger.js';

export class EspStreamManager extends StreamManager {
    constructor(url, recorder, notificationManager, detectionManager) {
        super(recorder);
        this.url = url;
        this.notificationManager = notificationManager;
        this.detectionManager = detectionManager;

        // Listen for detection
        if (this.detectionManager) {
            this.detectionManager.on('detection', (data) => {
                if (data.source === 'esp32' && data.label === 'cat') {
                    logger.info('Cat Detected on ESP32! Capturing frame...');
                    this.saveCatCapture();
                }
            });
        }

        this.request = null;
        this.response = null;
        this.retryTimeout = null;
        this.connect();
    }

    setMode(mode) {
        if (!super.setMode(mode)) return false;

        if (this.mode === 'continuous') {
            if (this.response) this.startRecording(this.response);
        } else {
            if (this.response) this.stopRecording(this.response);
        }
        return true;
    }

    connect() {
        logger.info(`Connecting to ESP32 stream at ${this.url}...`);
        this.request = http.get(this.url, (res) => {
            logger.info(`ESP32 Connected. Status: ${res.statusCode}`);
            this.response = res;

            this.startRecording(this.response);

            let buffer = Buffer.alloc(0);

            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                let offset = 0;
                while (true) {
                    const start = buffer.indexOf(SOI, offset);
                    if (start === -1) break;
                    const end = buffer.indexOf(EOI, start + 2);
                    if (end === -1) break;

                    const frame = buffer.subarray(start, end + 2);
                    this.broadcast(frame);

                    if (this.detectionManager) {
                        this.detectionManager.processFrame(frame, 'esp32');
                    }

                    offset = end + 2;
                }
                if (offset > 0) buffer = buffer.subarray(offset);
            });

            res.on('end', () => {
                logger.info('ESP32 Stream ended. Reconnecting...');
                this.stopRecording(this.response);
                this.response = null;
                this.scheduleReconnect();
            });

        }).on('error', (err) => {
            logger.error(`ESP32 Connection Error: ${err.message}`);
            if (this.response) {
                this.stopRecording(this.response);
                this.response = null;
            }
            this.scheduleReconnect();
        });
    }

    scheduleReconnect() {
        if (this.retryTimeout) clearTimeout(this.retryTimeout);
        this.retryTimeout = setTimeout(() => this.connect(), 5000);
    }

    addClient(ws) {
        super.addClient(ws);
        if (this.currentFrame && ws.readyState === WebSocket.OPEN) {
            this.sendFrameToClient(ws, this.currentFrame);
        }
    }

    // removeClient inherited
    // broadcast inherited
    // sendFrameToClient inherited

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
        const filename = `esp32-${timestamp}.jpg`;
        const catPath = path.join(IMAGES_DIR, filename);

        fs.writeFile(catPath, this.currentFrame, (err) => {
            if (err) {
                logger.error(`Failed to save ${filename}: ${err}`);
                return;
            }
            logger.info(`Saved images/${filename}`);

            const imageUrl = `https://${HOSTNAME}/images/${filename}`;
            if (this.notificationManager) {
                this.notificationManager.send(
                    'Cat Detected (ESP32)',
                    'ESP32 發現麻嚕!!',
                    { imageUrl }
                );
            }
        });
    }
}
