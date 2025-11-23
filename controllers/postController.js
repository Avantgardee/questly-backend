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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await PostModel.find({ tags: tag })
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments({ tags: tag });
        
        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить статьи'
            });
    }
};

export const getAllWithUser = async (req, res) => {
    try{
        const idUser = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await PostModel.find({ user: idUser })
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments({ user: idUser });
        
        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить статьи'
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const posts = await PostModel.find()
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments();
        
        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
    }
    catch (err) {
        console.log(err);
        res.status(500).json(
            {
                message: 'Не удалось получить статьи'
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        let posts;
        let total;
        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};

        if (postFilter === 'comments') {
            // Для агрегации сначала получаем общее количество
            const countResult = await PostModel.aggregate([
                {
                    $match: titleSearch
                },
                {
                    $addFields: {
                        commentCount: { $size: '$comments' }
                    }
                },
                {
                    $count: 'total'
                }
            ]);
            total = countResult[0]?.total || 0;

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
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);
        } else {
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            total = await PostModel.countDocuments(titleSearch);
            posts = await PostModel.find(titleSearch)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit)
                .exec();
        }

        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const user = await UserModel.findById(userId).select('subscriptions');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};
        const authorFilter = { user: { $in: user.subscriptions } };
        const searchCriteria = { ...titleSearch, ...authorFilter };

        let posts;
        let total;

        if (postFilter === 'comments') {
            // Для агрегации сначала получаем общее количество
            const countResult = await PostModel.aggregate([
                {
                    $match: searchCriteria
                },
                {
                    $addFields: {
                        commentCount: { $size: '$comments' }
                    }
                },
                {
                    $count: 'total'
                }
            ]);
            total = countResult[0]?.total || 0;

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
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);
        } else {
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            total = await PostModel.countDocuments(searchCriteria);
            posts = await PostModel.find(searchCriteria)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit)
                .exec();
        }

        res.json({
            posts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        });
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
    try {
        const postId = req.params.id;
        
        // Сначала находим пост, чтобы получить список комментариев
        const post = await PostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Статья не найдена' });
        }
        
        // Удаляем все связанные комментарии
        await CommentModel.deleteMany({ _id: { $in: post.comments } });
        
        // Удаляем сам пост
        await PostModel.findByIdAndDelete(postId);
        
        res.json({ success: true });
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