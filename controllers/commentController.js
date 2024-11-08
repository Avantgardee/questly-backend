import PostModel from "../models/post.js";
import CommentModel from "../models/comment.js";
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
                actionByUser: req.userId,      // ID пользователя, который подписывается
                actionOnUser: post.user,
                postId: postId // id статьи
            };

            // Отправляем сообщение в очередь 'subscribe_queue'
            await sendToRabbitMQ(message, 'comment');
        }

        catch (err){
            console.log(err);
            console.log('не получилось');
        }
        res.json(commSave);
    }
    catch (err){
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось создать комментарий'
            });
    }
}