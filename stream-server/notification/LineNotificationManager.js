import { messagingApi } from '@line/bot-sdk';
import { NotificationManager } from './NotificationManager.js';
import logger from '../utils/logger.js';

export class LineNotificationManager extends NotificationManager {
    constructor(accessToken) {
        super();
        this.accessToken = accessToken;
        if (!accessToken) {
            logger.warn('CHANNEL_ACCESS_TOKEN not set. Line notifications will fail.');
        }

        this.client = new messagingApi.MessagingApiClient({
            channelAccessToken: accessToken
        });
    }

    /**
     * Send a Line broadcast
     * @param {string} title - Ignored for now, or prepended
     * @param {string} message - The text message to send
     * @param {object} options - Options
     * @param {string} [options.imageUrl] - URL of the image
     */
    async send(title, message, options = {}) {
        if (!this.accessToken) return;

        try {
            const messages = [
                { type: 'text', text: message }
            ];

            if (options.imageUrl) {
                messages.push({
                    type: 'image',
                    originalContentUrl: options.imageUrl,
                    previewImageUrl: options.imageUrl
                });
            }

            await this.client.broadcast({ messages });
            logger.info('Line broadcast sent');
        } catch (err) {
            logger.error(`Line broadcast failed: ${err}`);
        }
    }
}
