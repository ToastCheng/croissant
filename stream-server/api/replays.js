import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { RECORDINGS_DIR, THUMBNAILS_DIR } from '../utils/constants.js';

const router = Router();

router.get('/', (req, res) => {
    // Helper to scan a directory
    const scanDir = (dir, relativePath = '') => {
        try {
            const items = fs.readdirSync(dir);
            let results = [];
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    results = results.concat(scanDir(fullPath, path.join(relativePath, item)));
                } else if (item.endsWith('.mp4')) {
                    const webPath = relativePath ? `${relativePath}/${item}` : item;
                    // Ensure forward slashes for URLs
                    const urlPath = webPath.split(path.sep).join('/');

                    const thumbDir = path.join(THUMBNAILS_DIR, relativePath);
                    const thumbName = item.replace('.mp4', '.jpg');
                    const hasThumb = fs.existsSync(path.join(thumbDir, thumbName));

                    // Determine camera source from path (first segment)
                    // If root: 'unknown'. If 'rpi/file.mp4': 'rpi'.
                    const parts = urlPath.split('/');
                    const camera = parts.length > 1 ? parts[0] : 'unknown';

                    results.push({
                        filename: urlPath,
                        url: `/recordings/${urlPath}`,
                        thumbnailUrl: hasThumb ? `/thumbnails/${urlPath.replace('.mp4', '.jpg')}` : null,
                        camera
                    });
                }
            }
            return results;
        } catch (e) {
            return [];
        }
    };

    const recordings = scanDir(RECORDINGS_DIR).sort((a, b) => b.filename.localeCompare(a.filename));
    res.json(recordings);
});

export default router;
