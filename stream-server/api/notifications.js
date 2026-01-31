import express from 'express';
import logger from '../utils/logger.js';

export default function createNotificationsRouter(subscriptionManager) {
    const router = express.Router();

    router.get('/vapid-key', (req, res) => {
        const key = process.env.VAPID_PUBLIC_KEY;
        if (!key) return res.status(500).json({ error: 'VAPID public key not configured' });
        res.json({ publicKey: key });
    });

    router.post('/subscribe', (req, res) => {
        const subscription = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        subscriptionManager.add(subscription);
        res.status(201).json({ message: 'Subscribed successfully' });
    });

    return router;
}
