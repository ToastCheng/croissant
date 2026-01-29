import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RECORDINGS_DIR, THUMBNAILS_DIR } from '../utils/constants.js';

const router = Router();

router.get('/', (req, res) => {
    fs.readdir(RECORDINGS_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read recordings' });

        const recordings = files
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const thumbName = f.replace('.mp4', '.jpg');
                const hasThumb = fs.existsSync(path.join(THUMBNAILS_DIR, thumbName));
                return {
                    filename: f,
                    url: `/recordings/${f}`,
                    thumbnailUrl: hasThumb ? `/thumbnails/${thumbName}` : null
                };
            })
            .sort((a, b) => b.filename.localeCompare(a.filename));

        res.json(recordings);
    });
});

export default router;
