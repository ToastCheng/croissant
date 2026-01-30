import http from 'node:http';
import WebSocket from 'ws';
import { SOI, EOI } from '../utils/constants.js';
import { StreamManager } from './StreamManager.js';
import logger from '../utils/logger.js';

export class EspStreamManager extends StreamManager {
    constructor(url, recorder) {
        super(recorder);
        this.url = url;
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
}
