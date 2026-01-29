import WebSocket from 'ws';
import logger from '../utils/logger.js';

export class StreamManager {
    constructor() {
        this.clients = new Set();
        this.currentFrame = null;
    }

    addClient(ws) {
        if (!this.clients.has(ws)) {
            this.clients.add(ws);
            logger.info(`Client added. Total clients: ${this.clients.size}`);
        }
    }

    removeClient(ws) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            logger.info(`Client removed. Total clients: ${this.clients.size}`);
        }
    }

    broadcast(frame) {
        this.currentFrame = frame;
        for (const client of this.clients) {
            this.sendFrameToClient(client, frame);
        }
    }

    sendFrameToClient(ws, frame) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(frame, (err) => {
                    if (err) logger.error(`WS send error: ${err}`);
                });
            } catch (e) {
                logger.error(`WS broadcast exception: ${e}`);
                this.removeClient(ws);
            }
        } else if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
            // console.error('websocket is not open:', ws.readyState);
            this.removeClient(ws);
        }
    }
}
