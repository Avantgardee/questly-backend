import NotificationModel from '../models/notification.js';
import UserModel from '../models/user.js';
import PostModel from '../models/post.js';
// Создание нового уведомления
export const createNotification = async (req, res) => {
    try {
        const { action, post } = req.body;
        const actionByUser = req.body.userId;  // ID пользователя, совершившего действие
        let actionOnUsers = [];  // ID пользователя, над которым действие, по умолчанию один

        if (action === 'post') {
            // Извлечение подписок пользователя из базы данных
            const user = await UserModel.findById(actionByUser);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            console.log(user);

            actionOnUsers = user.subscriptions; // Массив подписчиков пользователя
        }

        // Создаем одно уведомление с массивом actionOnUsers
        const notification = new NotificationModel({
            actionByUser,
            action,
            actionOnUser: actionOnUsers,  // Массив подписчиков
            post: post || null,  // Параметр поста может быть необязательным
        });

        await notification.save();

        res.json(notification);  // Возвращаем созданное уведомление
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ message: 'Failed to create notification' });
    }
};

// Получение уведомлений за последние 10 дней для пользователя
export const getNotificationsForUser = async (req, res) => {
    try {
        const userId = req.params.userId;

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        // Ищем уведомления, где userId присутствует в массиве actionOnUser
        const notifications = await NotificationModel.find({
            actionOnUser: { $in: [userId] },  // Проверяем, есть ли userId в массиве actionOnUser
            createdAt: { $gte: tenDaysAgo }
        })
            .populate('actionByUser', 'fullName avatarUrl')  // Подгружаем информацию о пользователе, совершившем действие
            .populate('post', 'title imageUrl');  // Подгружаем информацию о посте, если он есть

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Failed to get notifications' });
    }
};

