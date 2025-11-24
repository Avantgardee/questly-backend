import amqp from 'amqplib';
import NotificationModel from '../models/notification.js';
import UserModel from '../models/user.js';
import ChatModel from '../models/Chat.js';
import MessageModel from '../models/Message.js';
import PostModel from '../models/post.js';
export async function startRabbitMQConsumer() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();

        const queues = ['post_queue', 'comment_queue', 'subscribe_queue', 'message_queue', 'like_queue'];

        for (const queue of queues) {
            await channel.assertQueue(queue, { durable: true });

            channel.consume(queue, async (msg) => {
                if (msg !== null) {
                    const messageContent = JSON.parse(msg.content.toString());
                    await handleMessage(messageContent, queue);
                    channel.ack(msg);
                }
            });
        }

        console.log('RabbitMQ Consumer started and listening to queues:', queues);
    } catch (error) {
        console.error('Error starting RabbitMQ consumer:', error);
    }
}

async function handleMessage(message, queue) {
    const { action, postId, actionByUser, chatId, messageId } = message;
    let actionOnUser = message.actionOnUser || [];

    if (queue === 'post_queue') {
        const user = await UserModel.findById(actionByUser);
        if (user) {
            actionOnUser = user.subscribers;
        }
    } else if (queue === 'message_queue') {
        // Для сообщений actionOnUser - получатель сообщения
        const chat = await ChatModel.findById(chatId).populate('participants');
        if (chat) {
            const recipient = chat.participants.find(p => p._id.toString() !== actionByUser);
            if (recipient) {
                actionOnUser = [recipient._id];
            }
        }
    } else if (queue === 'like_queue') {
        // Для лайков actionOnUser - автор поста
        const post = await PostModel.findById(postId);
        if (post) {
            actionOnUser = [post.user];
            
            // Проверяем, есть ли уже уведомление о лайке от этого пользователя для этого поста
            const existingNotification = await NotificationModel.findOne({
                actionByUser: actionByUser,
                action: 'like',
                post: postId,
                actionOnUser: { $in: [post.user] }
            });
            
            // Если уведомление уже существует, не создаем новое
            if (existingNotification) {
                console.log('Notification for like already exists, skipping:', existingNotification._id);
                return;
            }
        }
    }

    const notification = new NotificationModel({
        actionByUser: actionByUser,
        action: action || queue.replace('_queue', ''),
        actionOnUser: actionOnUser,
        post: postId || null,
        chat: chatId || null,
        message: messageId || null
    });

    await notification.save();
    console.log('Notification saved:', notification);
}