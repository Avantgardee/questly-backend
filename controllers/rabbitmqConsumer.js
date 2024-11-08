// rabbitmqConsumer.js
import amqp from 'amqplib';
import NotificationModel from '../models/notification.js';
import UserModel from '../models/user.js';

export async function startRabbitMQConsumer() {
    try {
        // Подключаемся к RabbitMQ
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        // Создаем или подключаемся к очередям
        const queues = ['post_queue', 'comment_queue', 'subscribe_queue'];

        for (const queue of queues) {
            await channel.assertQueue(queue, { durable: true });

            // Потребляем сообщения из каждой очереди
            channel.consume(queue, async (msg) => {
                if (msg !== null) {
                    const messageContent = JSON.parse(msg.content.toString());

                    // Обработка полученного сообщения и создание уведомления
                    await handleMessage(messageContent, queue);

                    // Подтверждаем сообщение как обработанное
                    channel.ack(msg);
                }
            });
        }

        console.log('RabbitMQ Consumer started and listening to queues:', queues);
    } catch (error) {
        console.error('Error starting RabbitMQ consumer:', error);
    }
}

// Функция для обработки сообщения и создания уведомления
async function handleMessage(message, queue) {
    const { action, postId, actionByUser } = message;
    let actionOnUser = message.actionOnUser || [];

    if (queue === 'post_queue') {
        // Если действие 'post', получаем подписчиков пользователя
        const user = await UserModel.findById(actionByUser);
        if (user) {
            actionOnUser = user.subscribers;  // Массив подписчиков пользователя
        }
    }

    // Создаем уведомление в зависимости от типа действия
    const notification = new NotificationModel({
        actionByUser: actionByUser,
        action: action || queue.replace('_queue', ''),
        actionOnUser: actionOnUser,
        post: postId || null,
    });

    // Сохраняем уведомление в базе данных
    await notification.save();
    console.log('Notification saved:', notification);
}
