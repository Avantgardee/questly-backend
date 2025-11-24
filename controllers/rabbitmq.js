import amqp from 'amqplib';
import ChatModel from '../models/Chat.js';
export async function sendToRabbitMQ(message, actionType) {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        let queue;
        switch (actionType) {
            case 'post':
                queue = 'post_queue';
                break;
            case 'comment':
                queue = 'comment_queue';
                break;
            case 'subscribe':
                queue = 'subscribe_queue';
                break;
            case 'message':
                queue = 'message_queue';
                break;
            case 'like':
                queue = 'like_queue';
                break;
            default:
                throw new Error('Invalid action type');
        }

        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });

        console.log(`Message sent to RabbitMQ in ${queue}:`, message);

        setTimeout(() => {
            connection.close();
        }, 500);
    } catch (error) {
        console.error('Error sending message to RabbitMQ:', error);
    }
}