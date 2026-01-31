import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
    RECORDINGS_DIR,
    THUMBNAILS_DIR,
} from '../utils/constants.js';
import logger from '../utils/logger.js';

export class RecordManager {
    constructor(cameraName) {
        this.cameraName = cameraName || 'cam';
        this.ffmpegProcess = null;

        // Define subdirectories
        this.recDir = path.join(RECORDINGS_DIR, this.cameraName);
        this.thumbDir = path.join(THUMBNAILS_DIR, this.cameraName);

        // Ensure directories exist
        if (!fs.existsSync(this.recDir)) fs.mkdirSync(this.recDir, { recursive: true });
        if (!fs.existsSync(this.thumbDir)) fs.mkdirSync(this.thumbDir, { recursive: true });

        // Periodically cleanup
        setInterval(() => {
            this.rotateRecordings();
            this.ensureThumbnails();
        }, 60 * 1000);
    }

    start(inputStream) {
        if (this.ffmpegProcess) return;
        if (!inputStream) return;

        logger.info(`[${this.cameraName}] Starting recording...`);

        // Output to subdirectory
        const filenamePattern = `%Y%m%d-%H%M%S.mp4`;

        const args = [
            '-f', 'mjpeg', '-framerate', '15', '-i', '-', '-c:v', 'libx264', '-preset', 'ultrafast',
            '-f', 'segment', '-segment_time', '300', '-reset_timestamps', '1', '-strftime', '1',
            path.join(this.recDir, filenamePattern)
        ];

        this.ffmpegProcess = spawn('ffmpeg', args);
        inputStream.pipe(this.ffmpegProcess.stdin);

        this.ffmpegProcess.stderr.on('data', (data) => {
            // Verbose logging usually too noisy, keeping it debug
            logger.debug(`[${this.cameraName}] ffmpeg: ${data}`);
        });

        this.ffmpegProcess.on('error', (err) => logger.error(`[${this.cameraName}] ffmpeg error: ${err}`));

        this.ffmpegProcess.on('exit', (code) => {
            logger.info(`[${this.cameraName}] ffmpeg exited with code ${code}`);
            this.ffmpegProcess = null;
        });

        this.rotateRecordings();
    }

    stop(inputStream) {
        if (this.ffmpegProcess) {
            logger.info(`[${this.cameraName}] Stopping recording...`);
            const proc = this.ffmpegProcess;
            this.ffmpegProcess = null;

            // Unpipe the input stream if provided
            if (inputStream) inputStream.unpipe(proc.stdin);

            proc.kill('SIGTERM');

            return new Promise(resolve => {
                const handler = () => {
                    logger.info(`[${this.cameraName}] Recording process exited cleanly.`);
                    resolve();
                };
                proc.once('exit', handler);
                setTimeout(() => {
                    proc.off('exit', handler);
                    resolve();
                }, 2000);
            });
        }
        return Promise.resolve();
    }

    rotateRecordings() {
        fs.readdir(this.recDir, (err, files) => {
            if (err) return;
            const mp4s = files
                .filter(f => f.endsWith('.mp4'))
                .sort();

            if (mp4s.length > 36) {
                mp4s.slice(0, mp4s.length - 36).forEach(f => {
                    fs.unlink(path.join(this.recDir, f), (err) => {
                        if (!err) {
                            logger.info(`[${this.cameraName}] Deleted old recording: ${f}`);
                            const thumbName = f.replace('.mp4', '.jpg');
                            fs.unlink(path.join(this.thumbDir, thumbName), () => { });
                        }
                    });
                });
            }
        });
    }

    ensureThumbnails() {
        logger.info(`[${this.cameraName}] Ensuring thumbnails...`);
        fs.readdir(this.recDir, (err, files) => {
            if (err) {
                logger.error(`[${this.cameraName}] readdir error: ${err}`);
                return;
            }
            files.filter(f => f.endsWith('.mp4')).forEach(mp4 => {
                const jpg = mp4.replace('.mp4', '.jpg');
                const jpgPath = path.join(this.thumbDir, jpg);
                if (!fs.existsSync(jpgPath)) {
                    const mp4Path = path.join(this.recDir, mp4);
                    const ffmpeg = spawn('ffmpeg', [
                        '-y', '-i', mp4Path, '-ss', '00:00:01', '-vframes', '1', jpgPath
                    ]);
                    ffmpeg.on('error', (err) => logger.error(`[${this.cameraName}] ${jpgPath} thumbnail generation error: ${err}`));
                    ffmpeg.on('exit', (code) => {
                        // 183: already exists
                        if (code !== 183 && code !== 0) logger.error(`[${this.cameraName}] Failed to generate thumbnail for ${mp4} (code ${code})`);
                    });
                }
            });
        });
    }
}
