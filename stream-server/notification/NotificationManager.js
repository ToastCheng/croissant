import logger from '../utils/logger.js';

export class NotificationManager {
    constructor() {
        if (this.constructor === NotificationManager) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    /**
     * Send a notification
     * @param {string} title - The title of the notification (optional context)
     * @param {string} message - The main body text
     * @param {object} [options] - Additional options like imageUrl
     * @param {string} [options.imageUrl] - Full URL to an image to attach
     * @returns {Promise<void>}
     */
    async send(title, message, options = {}) {
        throw new Error("Method 'send()' must be implemented.");
    }
}
