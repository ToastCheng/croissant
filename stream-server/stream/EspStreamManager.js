import http from 'node:http';
import WebSocket from 'ws';
import { SOI, EOI } from '../utils/constants.js';
import { StreamManager } from './StreamManager.js';

export class EspStreamManager extends StreamManager {
    constructor(url) {
        super();
        this.url = url;
        this.request = null;
        this.retryTimeout = null;
        this.connect();
    }

    connect() {
        console.log(`Connecting to ESP32 stream at ${this.url}...`);
        this.request = http.get(this.url, (res) => {
            console.log(`ESP32 Connected. Status: ${res.statusCode}`);
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
        super.addClient(ws);
        if (this.currentFrame && ws.readyState === WebSocket.OPEN) {
            this.sendFrameToClient(ws, this.currentFrame);
        }
    }

    // removeClient inherited
    // broadcast inherited
    // sendFrameToClient inherited
}
