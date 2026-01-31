import fs from 'node:fs';
import path from 'node:path';
import logger from '../utils/logger.js';

const SUBSCRIPTION_FILE = path.join(process.cwd(), 'subscriptions.json');

export class SubscriptionManager {
    constructor() {
        this.subscriptions = [];
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(SUBSCRIPTION_FILE)) {
                const data = fs.readFileSync(SUBSCRIPTION_FILE, 'utf8');
                this.subscriptions = JSON.parse(data);
                logger.info(`Loaded ${this.subscriptions.length} push subscriptions.`);
            }
        } catch (err) {
            logger.error(`Failed to load subscriptions: ${err}`);
        }
    }

    save() {
        try {
            fs.writeFileSync(SUBSCRIPTION_FILE, JSON.stringify(this.subscriptions, null, 2));
        } catch (err) {
            logger.error(`Failed to save subscriptions: ${err}`);
        }
    }

    add(subscription) {
        // Prevent duplicates based on endpoint
        if (!this.subscriptions.find(s => s.endpoint === subscription.endpoint)) {
            this.subscriptions.push(subscription);
            this.save();
            logger.info('New push subscription added.');
            return true;
        }
        return false;
    }

    remove(endpoint) {
        const initialLength = this.subscriptions.length;
        this.subscriptions = this.subscriptions.filter(s => s.endpoint !== endpoint);
        if (this.subscriptions.length !== initialLength) {
            this.save();
            logger.info('Push subscription removed.');
        }
    }

    getAll() {
        return this.subscriptions;
    }
}
