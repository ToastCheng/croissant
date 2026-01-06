const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
    console.log('Connected to ws://localhost:3000/ws');
    // Send a test message or just exit successfully
    ws.close();
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('Connection failed:', err.message);
    process.exit(1);
});
