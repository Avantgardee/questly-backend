// rabbitmq.js
import amqp from 'amqplib';

// Функция для отправки сообщения в RabbitMQ
export async function sendToRabbitMQ(message, actionType) {
    try {
        // Подключение к серверу RabbitMQ
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // Определение очереди на основе типа действия
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
            default:
                throw new Error('Invalid action type');
        }

        // Создаем очередь, если она не существует
        await channel.assertQueue(queue, { durable: true });

        // Отправляем сообщение в очередь
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });

        console.log(`Message sent to RabbitMQ in ${queue}:`, message);

        setTimeout(() => {
            connection.close();
        }, 500);
    } catch (error) {
        console.error('Error sending message to RabbitMQ:', error);
    }
}
