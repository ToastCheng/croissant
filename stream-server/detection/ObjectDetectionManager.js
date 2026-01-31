import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import EventEmitter from 'node:events';
import logger from '../utils/logger.js';
import { PYTHON_EXEC, PYTHON_SCRIPT } from '../utils/constants.js';

class StateTracker {
    constructor(label, delayMs = 2000) {
        this.label = label;
        this.delayMs = delayMs;
        this.isPresent = false;
        this.potentialState = false;
        this.firstTransitionTime = 0;
    }

    update(isDetected) {
        if (isDetected !== this.potentialState) {
            this.potentialState = isDetected;
            this.firstTransitionTime = Date.now();
        } else if (this.potentialState !== this.isPresent) {
            if (Date.now() - this.firstTransitionTime >= this.delayMs) {
                this.isPresent = this.potentialState;
                logger.info(`State Update: ${this.label}Present = ${this.isPresent}`);
                return true;
            }
        }
        return false;
    }
}

export class ObjectDetectionManager extends EventEmitter {
    constructor() {
        super();
        this.pythonProcess = null;
        this.enabled = true;
        this.lastFrameTime = 0;

        // State Trackers are now dynamic per source
        this.sourceTrackers = new Map();
    }

    getTrackers(sourceId) {
        if (!this.sourceTrackers.has(sourceId)) {
            this.sourceTrackers.set(sourceId, {
                cat: new StateTracker(`[${sourceId}] cat`, 2000),
                person: new StateTracker(`[${sourceId}] person`, 2000)
            });
        }
        return this.sourceTrackers.get(sourceId);
    }

    start() {
        if (this.pythonProcess) return;

        logger.info('Starting Python Detection Service...');
        try {
            this.pythonProcess = spawn(PYTHON_EXEC, [PYTHON_SCRIPT]);
            const rl = createInterface({ input: this.pythonProcess.stdout });

            rl.on('line', (line) => {
                try {
                    const data = JSON.parse(line);
                    if (data.detections !== undefined && data.source) {
                        const source = data.source;
                        const trackers = this.getTrackers(source);

                        const hasCat = data.detections.some(d => d.label === 'cat');
                        const hasPerson = data.detections.some(d => d.label === 'person');

                        if (trackers.cat.update(hasCat)) {
                            this.emit('state-change', { source, label: 'cat', isPresent: trackers.cat.isPresent });
                            if (trackers.cat.isPresent) {
                                this.emit('detection', { source, label: 'cat' });
                            }
                        }

                        if (trackers.person.update(hasPerson)) {
                            this.emit('state-change', { source, label: 'person', isPresent: trackers.person.isPresent });
                        }
                    }
                } catch (e) {
                    logger.info(`Python: ${line}`);
                }
            });

            this.pythonProcess.stderr.on('data', d => logger.error(`Python Error: ${d.toString()}`));
            this.pythonProcess.on('exit', () => {
                this.pythonProcess = null;
                this.sourceTrackers.clear();
                logger.info('Python detection stopped');
            });
        } catch (error) {
            logger.error(`Failed to spawn python process: ${error}`);
        }
    }

    stop() {
        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
    }

    processFrame(frame, sourceId = 'unknown') {
        if (!this.enabled || !this.pythonProcess) return;

        // Rate limit globally for now (or per source? global is safer for CPU)
        const now = Date.now();
        if (now - this.lastFrameTime < 1000) return; // Rate limit 1fps

        this.lastFrameTime = now;
        try {
            const sourceBuffer = Buffer.from(sourceId);
            const idLen = sourceBuffer.length;
            const totalLength = 1 + idLen + frame.length;

            const header = Buffer.alloc(4 + 1 + idLen);
            header.writeUInt32BE(totalLength, 0);
            header.writeUInt8(idLen, 4);
            sourceBuffer.copy(header, 5);

            this.pythonProcess.stdin.write(header);
            this.pythonProcess.stdin.write(frame);
        } catch (e) {
            console.error('Error writing to python:', e);
        }
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        logger.info(`Detection enabled: ${this.enabled}`);
    }
}
