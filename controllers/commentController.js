import PostModel from "../models/post.js";
import CommentModel from "../models/comment.js";
import UserModel from "../models/user.js";
import {sendToRabbitMQ} from "./rabbitmq.js";


export const createComment = async (req, res) => {
    try{
        const comm = new CommentModel({
            text: req.body.text,
            user: req.userId,
        });
        const commSave  = await comm.save();
        const postId = req.params.id;

        try{
            await PostModel.findByIdAndUpdate(postId, {
                $push : {comments: comm._id}
            })
            const post = await PostModel.findById(postId);
            const message = {
                action: 'comment',
                actionByUser: req.userId,
                actionOnUser: post.user,
                postId: postId
            };

            await sendToRabbitMQ(message, 'comment');
        }

        catch (err){
            console.log(err);
            console.log('не получилось');
        }
        // Получаем данные пользователя отдельным запросом
        const user = await UserModel.findById(commSave.user)
            .select('fullName avatarUrl')
            .exec();
        
        // Формируем объект комментария с данными пользователя
        const commentWithUser = {
            ...commSave.toObject(),
            user: user ? {
                _id: user._id,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl
            } : null
        };
        
        res.json(commentWithUser);
    }
    catch (err){
        console.log('[COMMENT]', err);
        
        // Проверяем, является ли ошибка ошибкой дубликата ключа
        if (err.code === 11000) {
            return res.status(400).json({
                message: 'Ошибка: уникальный индекс на поле text все еще существует в базе данных. Запустите скрипт removeCommentIndex.js для удаления индекса.'
            });
        }
        
        res.status(500).json({
            message: 'Не удалось создать комментарий',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
}