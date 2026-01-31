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

        // State Trackers
        this.catTracker = new StateTracker('cat', 2000);
        this.personTracker = new StateTracker('person', 2000);
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
                    if (data.detections !== undefined) {
                        const hasCat = data.detections.some(d => d.label === 'cat');
                        const hasPerson = data.detections.some(d => d.label === 'person');

                        if (this.catTracker.update(hasCat)) {
                            // Emit event when state changes
                            this.emit('state-change', { label: 'cat', isPresent: this.catTracker.isPresent });

                            // Specific event for presence (legacy support?)
                            if (this.catTracker.isPresent) {
                                this.emit('detection', { label: 'cat' });
                            }
                        }

                        if (this.personTracker.update(hasPerson)) {
                            this.emit('state-change', { label: 'person', isPresent: this.personTracker.isPresent });
                        }
                    }
                } catch (e) {
                    logger.info(`Python: ${line}`);
                }
            });

            this.pythonProcess.stderr.on('data', d => logger.error(`Python Error: ${d.toString()}`));
            this.pythonProcess.on('exit', () => {
                this.pythonProcess = null;
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

    processFrame(frame) {
        if (!this.enabled || !this.pythonProcess) return;

        const now = Date.now();
        if (now - this.lastFrameTime < 1000) return; // Rate limit 1fps

        this.lastFrameTime = now;
        try {
            const header = Buffer.alloc(4);
            header.writeUInt32BE(frame.length, 0);
            this.pythonProcess.stdin.write(header);
            this.pythonProcess.stdin.write(frame);
        } catch (e) {
            console.error('Error writing to python:', e);
            // Don't kill process here, it might be transient or just stdin closed
        }
    }

    setEnabled(enabled) {
        this.enabled = !!enabled;
        logger.info(`Detection enabled: ${this.enabled}`);
    }
}
