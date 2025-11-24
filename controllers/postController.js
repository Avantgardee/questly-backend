import PostModel from "../models/post.js";
import {validationResult} from "express-validator";
import CommentModel from "../models/comment.js";
import UserModel from "../models/user.js";
import mongoose from "mongoose";
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

export const getMostLikedPosts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;
        
        const posts = await PostModel.aggregate([
            {
                $addFields: {
                    likesCount: { $size: { $ifNull: ['$likes', []] } }
                }
            },
            {
                $sort: { likesCount: -1, createdAt: -1 }
            },
            {
                $limit: limit
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
                $unwind: {
                    path: '$user',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: {
                    user: { $ne: null }
                }
            },
            {
                $project: {
                    _id: 1,
                    title: 1,
                    likesCount: 1,
                    user: { fullName: 1, avatarUrl: 1 }
                }
            }
        ]);

        res.json(posts.map(post => ({
            _id: post._id,
            title: post.title,
            likesCount: post.likesCount,
            user: post.user
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: 'Не удалось получить самые залайканные статьи'
        });
    }
};

export const getAllWithTag = async (req, res) => {
    try{
        const tag = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const likesFilter = req.query.likesFilter; // 'most' или 'least'

        if (likesFilter === 'most' || likesFilter === 'least') {
            const direction = likesFilter === 'most' ? -1 : 1;
            const posts = await PostModel.aggregate([
                {
                    $match: { tags: tag }
                },
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $sort: { likesCount: direction, createdAt: -1 }
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
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            const totalResult = await PostModel.aggregate([
                {
                    $match: { tags: tag }
                },
                {
                    $count: 'total'
                }
            ]);
            const total = totalResult[0]?.total || 0;

            return res.json({
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

        const posts = await PostModel.find({ tags: tag })
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments({ tags: tag });
        
        // Преобразуем posts в обычные объекты и добавляем likes как массив ID
        const postsWithLikes = posts.map(post => {
            const postObj = post.toObject();
            postObj.likes = postObj.likes || [];
            return postObj;
        });
        
        res.json({
            posts: postsWithLikes,
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
        const likesFilter = req.query.likesFilter; // 'most' или 'least'

        if (likesFilter === 'most' || likesFilter === 'least') {
            const direction = likesFilter === 'most' ? -1 : 1;
            const posts = await PostModel.aggregate([
                {
                    $match: { user: new mongoose.Types.ObjectId(idUser) }
                },
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $sort: { likesCount: direction, createdAt: -1 }
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
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            const totalResult = await PostModel.aggregate([
                {
                    $match: { user: new mongoose.Types.ObjectId(idUser) }
                },
                {
                    $count: 'total'
                }
            ]);
            const total = totalResult[0]?.total || 0;

            return res.json({
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

        const posts = await PostModel.find({ user: idUser })
            .populate('user', ['fullName', 'avatarUrl'])
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments({ user: idUser });
        
        // Преобразуем posts в обычные объекты и добавляем likes как массив ID
        const postsWithLikes = posts.map(post => {
            const postObj = post.toObject();
            postObj.likes = postObj.likes || [];
            return postObj;
        });
        
        res.json({
            posts: postsWithLikes,
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
        const likesFilter = req.query.likesFilter; // 'most' или 'least'

        let sortCriteria = { createdAt: -1 };
        if (likesFilter === 'most' || likesFilter === 'least') {
            // Используем агрегацию для сортировки по количеству лайков
            const direction = likesFilter === 'most' ? -1 : 1;
            const posts = await PostModel.aggregate([
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $sort: { likesCount: direction, createdAt: -1 }
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
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            const totalResult = await PostModel.aggregate([
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $count: 'total'
                }
            ]);
            const total = totalResult[0]?.total || 0;

            return res.json({
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

        const posts = await PostModel.find()
            .populate('user', ['fullName', 'avatarUrl'])
            .sort(sortCriteria)
            .skip(skip)
            .limit(limit)
            .exec();
        
        const total = await PostModel.countDocuments();
        
        // Преобразуем posts в обычные объекты и добавляем likes как массив ID
        const postsWithLikes = posts.map(post => {
            const postObj = post.toObject();
            postObj.likes = postObj.likes || [];
            return postObj;
        });
        
        res.json({
            posts: postsWithLikes,
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
        const likesFilter = req.query.likesFilter; // 'most' или 'least'

        let posts;
        let total;
        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};

        if (postFilter === 'likes') {
            // Фильтр по лайкам
            // Если likesFilter не передан, используем значение по умолчанию на основе filterDirection
            const effectiveLikesFilter = likesFilter || (filterDirection === -1 ? 'most' : 'least');
            const direction = effectiveLikesFilter === 'most' ? -1 : 1;
            const countResult = await PostModel.aggregate([
                {
                    $match: titleSearch
                },
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
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
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $sort: { likesCount: direction, createdAt: -1 }
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
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            return res.json({
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
                        likes: 1,
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
            // Для обычных фильтров (createdAt, viewsCount и т.д.)
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            total = await PostModel.countDocuments(titleSearch);
            posts = await PostModel.find(titleSearch)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit)
                .exec();
            
            // Преобразуем posts в обычные объекты и добавляем likes как массив ID
            posts = posts.map(post => {
                const postObj = post.toObject();
                postObj.likes = postObj.likes || [];
                return postObj;
            });
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
        const likesFilter = req.query.likesFilter; // 'most' или 'least'

        const user = await UserModel.findById(userId).select('subscriptions');
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const titleSearch = str ? { title: { $regex: new RegExp(str, 'i') } } : {};
        const authorFilter = { user: { $in: user.subscriptions } };
        const searchCriteria = { ...titleSearch, ...authorFilter };

        let posts;
        let total;

        if (postFilter === 'likes') {
            // Фильтр по лайкам
            // Если likesFilter не передан, используем значение по умолчанию на основе filterDirection
            const effectiveLikesFilter = likesFilter || (filterDirection === -1 ? 'most' : 'least');
            const direction = effectiveLikesFilter === 'most' ? -1 : 1;
            const countResult = await PostModel.aggregate([
                {
                    $match: searchCriteria
                },
                {
                    $addFields: {
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
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
                        likesCount: { $size: { $ifNull: ['$likes', []] } }
                    }
                },
                {
                    $sort: { likesCount: direction, createdAt: -1 }
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
                        likes: 1,
                        createdAt: 1,
                        updatedAt: 1
                    }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            return res.json({
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
                        likes: 1,
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
            // Для обычных фильтров (createdAt, viewsCount и т.д.)
            const sortCriteria = {};
            sortCriteria[postFilter] = filterDirection;
            total = await PostModel.countDocuments(searchCriteria);
            posts = await PostModel.find(searchCriteria)
                .populate('user', ['fullName', 'avatarUrl'])
                .sort(sortCriteria)
                .skip(skip)
                .limit(limit)
                .exec();
            
            // Преобразуем posts в обычные объекты и добавляем likes как массив ID
            posts = posts.map(post => {
                const postObj = post.toObject();
                postObj.likes = postObj.likes || [];
                return postObj;
            });
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

export const likePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Не авторизован' });
        }

        const post = await PostModel.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        const isLiked = post.likes.includes(userId);
        
        if (isLiked) {
            // Убираем лайк
            post.likes = post.likes.filter(likeId => likeId.toString() !== userId.toString());
        } else {
            // Добавляем лайк
            post.likes.push(userId);
            
            // Отправляем уведомление автору поста (только если это не его собственный пост)
            if (post.user.toString() !== userId.toString()) {
                try {
                    const message = {
                        action: 'like',
                        actionByUser: userId,
                        actionOnUser: post.user,
                        postId: postId
                    };
                    await sendToRabbitMQ(message, 'like');
                } catch (err) {
                    console.log('Ошибка при отправке уведомления о лайке:', err);
                }
            }
        }

        await post.save();

        const updatedPost = await PostModel.findById(postId)
            .populate('user', ['fullName', 'avatarUrl'])
            .populate('likes', ['fullName', 'avatarUrl']);

        res.json({
            post: updatedPost,
            isLiked: !isLiked,
            likesCount: updatedPost.likes.length
        });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось поставить лайк' });
    }
};

export const getPostLikes = async (req, res) => {
    try {
        const postId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const post = await PostModel.findById(postId).select('likes');
        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        const users = await UserModel.find({ _id: { $in: post.likes } })
            .select('fullName avatarUrl email')
            .skip(skip)
            .limit(limit)
            .exec();

        const total = post.likes.length;

        res.json({
            users,
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
        res.status(500).json({ message: 'Не удалось получить список лайков' });
    }
};

export const getOne = async (req, res) => {
    try{

        const postId = req.params.id;
        const userId = req.userId; // Может быть undefined, если не авторизован
        
        // Сначала получаем пост без обновления
        let post = await PostModel.findById(postId)
            .populate('user', ['fullName', 'avatarUrl'])
            .populate('likes', ['fullName', 'avatarUrl'])
            .exec();

        if (!post) {
            return res.status(404).json({ message: "Статья не найдена" });
        }

        // Если пользователь авторизован, проверяем, просматривал ли он уже этот пост
        if (userId) {
            // Проверяем, есть ли пользователь в массиве viewedBy
            // viewedBy может быть undefined для старых постов, поэтому используем || []
            const viewedByArray = post.viewedBy || [];
            const hasViewed = viewedByArray.some(viewerId => {
                const viewerIdStr = typeof viewerId === 'object' ? viewerId.toString() : viewerId.toString();
                return viewerIdStr === userId.toString();
            });

            // Если пользователь еще не просматривал пост, добавляем его в viewedBy и увеличиваем счетчик
            if (!hasViewed) {
                post = await PostModel.findByIdAndUpdate(
                    postId,
                    { 
                        $addToSet: { viewedBy: userId }, // $addToSet добавляет только если элемента еще нет
                        $inc: { viewsCount: 1 }
                    },
                    { new: true } // Возвращаем обновленный документ
                )
                .populate('user', ['fullName', 'avatarUrl'])
                .populate('likes', ['fullName', 'avatarUrl'])
                .exec();
            }
        } else {
            // Для неавторизованных пользователей не увеличиваем счетчик
            // Можно добавить логику с cookie/localStorage, но пока оставим так
        }

        // Проверяем, лайкнул ли текущий пользователь пост
        const isLiked = userId && post.likes.some(like => {
            const likeId = typeof like === 'object' ? like._id.toString() : like.toString();
            return likeId === userId.toString();
        });

        const postObj = post.toObject();
        postObj.isLiked = isLiked || false;

        res.json(postObj);
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