import PostModel from "../models/post.js";
import {validationResult} from "express-validator";
import CommentModel from "../models/comment.js";
import UserModel from "../models/user.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {sendToRabbitMQ} from "./rabbitmq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getPopularTags = async (req, res) => {
    try {
        const tags = await PostModel.aggregate([
            { $unwind: "$tags" },
            { $group: { _id: "$tags", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        res.json(tags.map(tag => ({ tag: tag._id, count: tag.count })));
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Не удалось получить популярные теги'
        });
    }
};

export const getAllWithTag = async (req, res) => {
    try{
        const tag = req.params.id;
        const posts = await PostModel.find({ tags: tag }).populate('user', ['fullName', 'avatarUrl']).exec();
        res.json(posts);
    }

    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось создать статью'
            });
    }
};

export const getAllWithUser = async (req, res) => {
    try{
        const idUser = req.params.id;
        const posts = await PostModel.find({ user: idUser }).populate('user', ['fullName', 'avatarUrl']).exec();
        res.json(posts);
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось создать статью'
            });
    }
};

export const create = async (req, res) => {
    try{
        const doc = new PostModel({
            title: req.body.title,
            text: req.body.text,
            tags: req.body.tags,
            user: req.userId,
        });
        const post  = await doc.save();
        const message = {
            actionByUser: req.userId,  // id пользователя
            action: 'post',      // флаг действия (в данном случае post)
            postId: post._id  // id созданного поста
        };
        await sendToRabbitMQ(message, 'post');
        res.json({ success: true, postId: post._id });
    }
    catch (err){
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось создать статью'
            });
    }
}
export const addImage = async (req,res) => {
    try {
        const postId = req.body.postId;
        const post = await PostModel.findById(postId);

        if (!post) {
            return res.status(404).json({ message: 'Статья не найдена' });
        }

        post.imageUrl = `/uploads/${req.file.originalname}`;
        await post.save();

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось загрузить изображение' });
    }
};


export const getAll = async (req, res) => {
    try{
        const posts = await PostModel.find()
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .exec();
        res.json(posts);
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось создать статью'
            });
    }
}

export const getPostComments = async (req, res) => {
    try{
        const post = await PostModel.findById(req.params.id)
        const list = await Promise.all(
            post.comments.map((comment) =>{
                return CommentModel.findById(comment).populate('user',['fullName','avatarUrl']).exec();
            }),
        )
        res.json(list);
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить комментарии для статьи статью'
            });
    }
}


export const getAllWithFilter = async (req, res) => {
    try {
        const postFilter = req.params.id;
        const how = req.params.how;
        const str = req.params.str || '';
        const filterDirection = how === 'asc' ? 1 : -1;

        let posts;
        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};

        if (postFilter === 'comments') {
            posts = await PostModel.aggregate([
                {
                    $match: titleSearch
                },
                {
                    $addFields: {
                        commentCount: { $size: '$comments' }
                    }
                },
                {
                    $sort: { commentCount: filterDirection }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                {
                    $unwind: '$user'
                },
                {
                    $project: {
                        title: 1,
                        text: 1,
                        tags: 1,
                        viewsCount: 1,
                        imageUrl: 1,
                        user: { fullName: 1, avatarUrl: 1 },
                        comments: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        commentCount: 1
                    }
                }
            ]);
        } else {
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            posts = await PostModel.find(titleSearch)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .exec();
        }

        res.json(posts);
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Не удалось отфильтровать статьи'
        });
    }
};

export const getAllPostsFromSubscriptions = async (req, res) => {
    try {
        const userId = req.userId;
        const postFilter = req.params.id;
        const how = req.params.how;
        const str = req.params.str || '';
        const filterDirection = how === 'asc' ? 1 : -1;

        const user = await UserModel.findById(userId).select('subscriptions');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }


        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};

        const authorFilter = { user: { $in: user.subscriptions } };

        const searchCriteria = { ...titleSearch, ...authorFilter };

        let posts;

        if (postFilter === 'comments') {
            posts = await PostModel.aggregate([
                {
                    $match: searchCriteria
                },
                {
                    $addFields: {
                        commentCount: { $size: '$comments' }
                    }
                },
                {
                    $sort: { commentCount: filterDirection }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                {
                    $unwind: '$user'
                },
                {
                    $project: {
                        title: 1,
                        text: 1,
                        tags: 1,
                        viewsCount: 1,
                        imageUrl: 1,
                        user: { fullName: 1, avatarUrl: 1 },
                        comments: 1,
                        createdAt: 1,
                        updatedAt: 1,
                        commentCount: 1
                    }
                }
            ]);
        } else {
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            posts = await PostModel.find(searchCriteria)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .exec();
        }

        res.json(posts);
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Не удалось отфильтровать статьи'
        });
    }
};

export const getOne = async (req, res) => {
    try{

        const postId = req.params.id;
        PostModel.findOneAndUpdate(
            { _id: postId } ,{ $inc: { viewsCount: 1 } },{ returnDocument: "After" } ).populate('user',['fullName','avatarUrl'])
            .then(doc => res.json(doc))
            .catch(err => res.status(500).json({ message: "Статья не найдена" }))
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить статью'
            });
    }
}
export const remove = async (req, res) => {
    try{
        const postId = req.params.id;

        PostModel.findOneAndDelete({ _id: postId })
            .then(doc => {
                if (!doc) {
                    return res.status(404).json({ message: 'Статья не найдена' });
                }
                res.json({ success: true });
            })
            .catch(err => {
                console.log(err);
                res.status(500).json({ message: 'Не удалось удалить статью' });
            });
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить статью'
            });
    }
}
export const update = async (req, res) => {
    try{

        const postId = req.params.id;
        await PostModel.updateOne(
            {
            _id: postId,
            },
            {
                title: req.body.title,
                text: req.body.text,
                tags: req.body.tags,
                user: req.userId,
            },
        );
        res.json({
            success: true,
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось обновить статью'
            });
    }
}
export const updateImage = async (req, res) => {
    try {
        const postId = req.body.postId;
        const post = await PostModel.findById(postId);

        if (!post) {
            return res.status(404).json({ message: 'Статья не найдена' });
        }

        if (req.file) {

            // Удаляем старый файл, если существует
            if (post.imageUrl) {
                const oldPath = path.join(__dirname, '..', post.imageUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            // Обновляем с новым изображением
            post.imageUrl = `/uploads/${req.file.filename}`;
        } else {

            // Если нет нового файла, удаляем старый
            if (post.imageUrl) {
                const oldPath = path.join(__dirname, '..', post.imageUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            post.imageUrl = '';
        }
        await post.save();
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось обновить изображение статьи' });
    }
};