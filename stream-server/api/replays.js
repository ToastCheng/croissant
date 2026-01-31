import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RECORDINGS_DIR, THUMBNAILS_DIR } from '../utils/constants.js';

const router = Router();

// Helper to scan a directory
const scanDir = (dir, relativePath = '') => {
    try {
        if (!fs.existsSync(dir)) return [];

        const items = fs.readdirSync(dir);
        let results = [];
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                results = results.concat(scanDir(fullPath, path.join(relativePath, item)));
            } else if (item.endsWith('.mp4') && relativePath) {
                // Ensure forward slashes for URLs
                const webPath = `${relativePath}/${item}`;
                const urlPath = webPath.split(path.sep).join('/');

                const thumbDir = path.join(THUMBNAILS_DIR, relativePath);
                const thumbName = item.replace('.mp4', '.jpg');
                const hasThumb = fs.existsSync(path.join(thumbDir, thumbName));

                results.push({
                    filename: urlPath,
                    url: `/recordings/${urlPath}`,
                    thumbnailUrl: hasThumb ? `/thumbnails/${urlPath.replace('.mp4', '.jpg')}` : null
                });
            }
        }
        return results;
    } catch (e) {
        return [];
    }
};

router.get('/:camera', (req, res) => {
    const { camera } = req.params;

    let targetDir = RECORDINGS_DIR;
    let relativeStart = '';

    if (camera) {
        // Sanitize camera param to prevent directory traversal
        const safeCamera = camera.replace(/[^a-zA-Z0-9_\-]/g, '');
        targetDir = path.join(RECORDINGS_DIR, safeCamera);
        relativeStart = safeCamera;
    }

    const recordings = scanDir(targetDir, relativeStart)
        .sort((a, b) => b.filename.localeCompare(a.filename))
        .map(rec => ({
            ...rec,
            camera: camera || (rec.filename.split('/').length > 1 ? rec.filename.split('/')[0] : 'unknown')
        }));

    res.json(recordings);
});

export default router;
