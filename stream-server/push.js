import 'dotenv/config';
import { messagingApi } from '@line/bot-sdk';

const HOSTNAME = process.env.PUBLIC_HOSTNAME || 'localhost:3000';


// create LINE SDK config from env variables
// const config = {
//     channelSecret: process.env.CHANNEL_SECRET,
// };

// create LINE SDK client
const client = new messagingApi.MessagingApiClient({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
});

const messages = [
    {
        type: 'text',
        text: '發現麻嚕!!'
    },
    // {
    //     type: 'text',
    //     text: 'http://home.toastcheng.com/stream'
    // },
    {
        type: 'image',
        originalContentUrl: `https://${HOSTNAME}/msg/cat.jpg`,
        previewImageUrl: `https://${HOSTNAME}/msg/cat_preview.jpg`
    }
];

client.broadcast({ messages })
    .then(() => console.log('Line broadcast sent'))
    .catch((err) => console.error('Line broadcast failed:', err));
return;