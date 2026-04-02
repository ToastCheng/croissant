import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from '../utils/constants.js';

const router = Router();

router.get('/:camera', (req, res) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);
    const camera = req.params.camera;
    const targetDir = path.join(IMAGES_DIR, camera);

    fs.readdir(targetDir, (err, files) => {
        if (err) return res.json(page ? { images: [], total: 0 } : []);

        let allImages = files
            .filter(f => f.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a));

        if (!isNaN(page) && !isNaN(limit)) {
            const total = allImages.length;
            const totalPages = Math.ceil(total / limit);
            const startIndex = (page - 1) * limit;
            const sliced = allImages.slice(startIndex, startIndex + limit).map(f => ({
                filename: f,
                url: `/images/${camera}/${f}`
            }));

            res.json({
                images: sliced,
                total,
                page,
                totalPages
            });
        } else {
            const sliced = allImages.slice(0, 5).map(f => ({
                filename: f,
                url: `/images/${camera}/${f}`
            }));
            res.json(sliced);
        }
    });
});

router.get('/:camera/:filename/surrounding', (req, res) => {
    const camera = req.params.camera;
    const filename = req.params.filename;
    const targetDir = path.join(IMAGES_DIR, camera);

    fs.readdir(targetDir, (err, files) => {
        if (err) return res.status(500).json({ error: 'Failed to read images' });

        let allImages = files
            .filter(f => f.endsWith('.jpg'))
            .sort((a, b) => b.localeCompare(a));
        
        const index = allImages.indexOf(filename);
        if (index === -1) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        const prev = index > 0 ? allImages[index - 1] : null;
        const next = index < allImages.length - 1 ? allImages[index + 1] : null;
        
        res.json({ prev, next });
    });
});

export default router;
