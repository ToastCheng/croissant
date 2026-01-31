import webpush from 'web-push';
import { NotificationManager } from './NotificationManager.js';
import logger from '../utils/logger.js';


export class WebPushNotificationManager extends NotificationManager {
    constructor(subscriptionManager) {
        super();
        this.subscriptionManager = subscriptionManager;

        // TODO: move environment variables to home.js and pass it to this class.
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT;

        if (!publicKey || !privateKey || !subject) {
            logger.warn('VAPID keys not set. WebPush notifications will fail.');
        } else {
            webpush.setVapidDetails(subject, publicKey, privateKey);
            logger.info('WebPush initialized with VAPID keys.');
        }
    }

    /**
     * Send a WebPush notification to all subscribers
     * @param {string} title - Notification title
     * @param {string} message - Notification body
     * @param {object} options - Options
     * @param {string} [options.imageUrl] - Icon or image URL
     */
    async send(title, message, options = {}) {
        const payload = JSON.stringify({
            title: title,
            body: message,
            icon: options.imageUrl, // Use imageUrl as icon if provided
            image: options.imageUrl,
            url: options.url || '/' // Default open action
        });

        const subscriptions = this.subscriptionManager.getAll();
        if (subscriptions.length === 0) return;

        logger.info(`Sending WebPush to ${subscriptions.length} subscribers...`);

        const promises = subscriptions.map(sub => {
            return webpush.sendNotification(sub, payload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription is gone, remove it
                        logger.info(`Subscription expired/invalid, removing: ${sub.endpoint}`);
                        this.subscriptionManager.remove(sub.endpoint);
                    } else {
                        logger.error(`WebPush failed for ${sub.endpoint}: ${err}`);
                    }
                });
        });

        await Promise.all(promises);
    }
}
