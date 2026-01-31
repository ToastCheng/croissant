import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { parse } from 'node:url';

// Managers
import { RpiStreamManager } from './stream/RpiStreamManager.js';
import { EspStreamManager } from './stream/EspStreamManager.js';
import { RecordManager } from './stream/RecordManager.js';
import { LineNotificationManager } from './notification/LineNotificationManager.js';

// Middleware
import { protect } from './middleware/auth.js';

// API Routers
import statsRouter from './api/stats.js';
import replaysRouter from './api/replays.js';
import imagesRouter from './api/images.js';
import createSettingsRouter from './api/settings.js';

// Constants
import { RECORDINGS_DIR, THUMBNAILS_DIR, IMAGES_DIR } from './utils/constants.js';
import logger from './utils/logger.js';

// --- INITIALIZATION ---
const app = express();
const server = http.createServer(app);

// Instantiate Recorders
const rpiRecorder = new RecordManager('rpi');
const espRecorder = new RecordManager('esp32');

const lineNotificationManager = new LineNotificationManager(process.env.CHANNEL_ACCESS_TOKEN)

// Instantiate Managers
const rpiStreamManager = new RpiStreamManager(rpiRecorder, lineNotificationManager);
// const rpiStreamManager = new RpiStreamManager();
const espStreamManager = new EspStreamManager('http://192.168.1.114/stream', espRecorder);
// const espStreamManager = new EspStreamManager('http://192.168.1.114/stream');


// --- EXPRESS SETUP ---

// Global Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, Authorization');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

app.use(express.json());

// Public Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Protected Routes
app.use('/api', protect);
app.use('/recordings', protect);
app.use('/thumbnails', protect);
app.use('/images', protect);

// API Routers
app.use('/api/stats', statsRouter);
app.use('/api/replays', replaysRouter);
app.use('/api/images', imagesRouter);
app.use('/api/settings', createSettingsRouter(rpiStreamManager));

// Static Files
app.use('/recordings', express.static(RECORDINGS_DIR));
app.use('/thumbnails', express.static(THUMBNAILS_DIR, { maxAge: '1h' }));
app.use('/images', express.static(IMAGES_DIR));

// Fallback
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// --- WEBSOCKET SETUP ---
const wss = new WebSocketServer({ noServer: true });
const wssEsp = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);

    if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else if (pathname === '/ws/esp32') {
        wssEsp.handleUpgrade(request, socket, head, (ws) => {
            wssEsp.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws) => {
    logger.info('RPi Client connected');
    ws.on('message', (message) => {
        const msg = message.toString();
        if (msg === 'start') rpiStreamManager.addClient(ws);
        else if (msg === 'stop') rpiStreamManager.removeClient(ws);
    });
    ws.on('close', () => {
        logger.info('RPi Client disconnected');
        rpiStreamManager.removeClient(ws);
    });
});

wssEsp.on('connection', (ws) => {
    logger.info('ESP32 Client connected');
    ws.on('message', (message) => {
        const msg = message.toString();
        if (msg === 'start') espStreamManager.addClient(ws);
        else if (msg === 'stop') espStreamManager.removeClient(ws);
    });
    ws.on('close', () => {
        logger.info('ESP32 Client disconnected');
        espStreamManager.removeClient(ws);
    });
});

// --- SERVER START ---
server.listen(8080, () => {
    logger.info('Express Server listening on port 8080');
});

// Robust cleanup
const cleanup = async () => {
    logger.info('Server shutting down...');
    server.close();
    wss.close();
    wssEsp.close();
    await rpiStreamManager.forceStop();
    logger.info('Cleanup complete. Exiting.');
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
