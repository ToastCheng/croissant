import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Go up one level from utils/ to get to stream-server root
const PROJECT_ROOT = join(__dirname, '..');

export const HOSTNAME = process.env.PUBLIC_HOSTNAME || 'localhost:3000';

export const RECORDINGS_DIR = join(PROJECT_ROOT, 'recordings');
export const THUMBNAILS_DIR = join(PROJECT_ROOT, 'thumbnails');
export const IMAGES_DIR = join(PROJECT_ROOT, 'images');

// Python paths (relative to stream-server)
export const MAX_REPLAY_FILES = parseInt(process.env.MAX_REPLAY_FILES) || 72;
export const ESP32_STREAM_URL = process.env.ESP32_STREAM_URL || 'http://192.168.1.106/stream';
export const PYTHON_EXEC = join(PROJECT_ROOT, '../image-server/venv/bin/python');
export const PYTHON_SCRIPT = join(PROJECT_ROOT, '../image-server/video_processor.py');

export const SOI = Buffer.from([0xff, 0xd8]);
export const EOI = Buffer.from([0xff, 0xd9]);
