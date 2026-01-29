import WebSocket from 'ws';

export class StreamManager {
    constructor() {
        this.clients = new Set();
        this.currentFrame = null;
    }

    addClient(ws) {
        if (!this.clients.has(ws)) {
            this.clients.add(ws);
            console.log(`Client added. Total clients: ${this.clients.size}`);
        }
    }

    removeClient(ws) {
        if (this.clients.has(ws)) {
            this.clients.delete(ws);
            console.log(`Client removed. Total clients: ${this.clients.size}`);
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
                    if (err) console.error('WS send error:', err);
                });
            } catch (e) {
                console.error('WS broadcast exception:', e);
                this.removeClient(ws);
            }
        } else {
            console.error('websocket is not open:', ws.readyState);
        }
    }
}
