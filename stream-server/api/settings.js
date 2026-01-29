import { Router } from 'express';

export default (rpiStreamManager) => {
    const router = Router();

    router.get('/', (req, res) => {
        res.json({
            mode: rpiStreamManager.mode,
            detectionEnabled: rpiStreamManager.detectionEnabled
        });
    });

    router.post('/', (req, res) => {
        const { mode, detectionEnabled } = req.body;
        let updated = false;

        if (mode !== undefined) {
            if (rpiStreamManager.setMode(mode)) updated = true;
        }
        if (detectionEnabled !== undefined) {
            if (rpiStreamManager.setDetection(detectionEnabled)) updated = true;
        }

        if (updated) {
            res.json({
                status: 'updated',
                mode: rpiStreamManager.mode,
                detectionEnabled: rpiStreamManager.detectionEnabled
            });
        } else {
            res.status(400).json({ error: 'Invalid settings' });
        }
    });

    return router;
};
