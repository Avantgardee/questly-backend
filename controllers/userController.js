import bcrypt from "bcrypt";
import UserModel from "../models/user.js";
import jwt from "jsonwebtoken";
import moment from 'moment';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {sendToRabbitMQ} from "./rabbitmq.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const getToken = async (req, res) => {
    try {
        const token = jwt.sign({ _id: req.userId }, 'secret123', { expiresIn: '1h' });

        res.json({ token });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить токен' });
    }
};

export const getWebSocketToken = async (req, res) => {
    try {
        const wsToken = jwt.sign({
            _id: req.userId,
            purpose: 'websocket'
        }, 'secret123', { expiresIn: '1h' });

        res.json({ wsToken });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить WebSocket токен' });
    }
};

export const registerData = async (req, res) => {
    try {
        const { email, fullName, password } = req.body;

        if (!email || !fullName || !password) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте все необходимые данные' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const doc = new UserModel({
            email,
            fullName,
            passwordHash: hash,
        });

        const user = await doc.save();

        const token = jwt.sign({ _id: user._id }, 'secret123', { expiresIn: '30d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, userId: user._id });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось зарегистрироваться' });
    }
};

export const registerImage = async (req, res) => {
    try {
        const userId = req.body.userId;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        user.avatarUrl = `/uploads/${req.file.originalname}`;
        await user.save();

        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось загрузить изображение' });
    }
};

export const login = async (req, res) => {
    try {
        const user = await UserModel.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({
                message: 'Пользователь не найден'
            });
        }

        const isValidPass = await bcrypt.compare(req.body.password, user._doc.passwordHash);
        if (!isValidPass) {
            return res.status(400).json({
                message: 'Неверный пароль или логин'
            });
        }

        const token = jwt.sign({
                _id: user._id
            },
            'secret123',
            {
                expiresIn: '30d',
            });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000
        });

        const { passwordHash, ...userData } = user._doc;
        res.json(userData);
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Не удалось авторизоваться'
        });
    }
};

export const logout = async (req, res) => {
    try {
        res.clearCookie('token');
        res.json({ success: true, message: 'Вы успешно вышли из системы' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Ошибка при выходе из системы' });
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await UserModel.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                message: 'Пользователь не найден'
            });
        }
        const { passwordHash, ...userData } = user._doc;
        res.json(userData);
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Нет доступа'
        });
    }
};

export const getUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: 'Пользователь не найден'
            });
        }
        const { passwordHash, ...userData } = user._doc;
        res.json(userData);
    } catch (err) {
        console.log(err);
        res.status(500).json({
            message: 'Нет доступа'
        });
    }
};

export const updateUserData = async (req, res) => {
    try {
        const { fullName, birthDate, bio } = req.body;

        if (!fullName || !birthDate) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте все необходимые данные' });
        }

        const formattedBirthDate = moment(birthDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

        const userId = req.params.id;
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        user.fullName = fullName;
        user.birthDate = formattedBirthDate;
        user.bio = bio;

        await user.save();

        res.json({ success: true, user });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось обновить данные пользователя' });
    }
};

export const updateUserAvatar = async (req, res) => {
    try {
        console.log(__dirname);
        const userId = req.userId;
        console.log(userId);
        const user = await UserModel.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        if (req.file) {
            if (user.avatarUrl) {
                const oldPath = path.join(__dirname, '..', user.avatarUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            user.avatarUrl = `/uploads/${req.file.filename}`;
        } else {
            console.log(user.avatarUrl);
            if (user.avatarUrl) {
                const oldPath = path.join(__dirname, '..', user.avatarUrl);
                console.log(oldPath);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            user.avatarUrl = '';
        }
        await user.save();
        res.json({ success: true });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось обновить изображение пользователя' });
    }
};

export const subscribeUser = async (req, res) => {
    try {
        const idSubscribe = req.params.id;
        const userId = req.userId;
        if (!userId || !idSubscribe) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте все необходимые данные' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь, который хочет подписаться, не найден' });
        }

        const subscribeUser = await UserModel.findById(idSubscribe);
        if (!subscribeUser) {
            return res.status(404).json({ message: 'Пользователь, на которого хотят подписаться, не найден' });
        }

        if (!user.subscriptions.includes(idSubscribe)) {
            user.subscriptions.push(idSubscribe);
        }

        if (!subscribeUser.subscribers.includes(userId)) {
            subscribeUser.subscribers.push(userId);
        }

        await user.save();
        await subscribeUser.save();

        const message = {
            action: 'subscribe',
            actionByUser: userId,
            actionOnUser: idSubscribe
        };

        await sendToRabbitMQ(message, 'subscribe');
        res.json({ success: true, message: 'Подпика успешно оформлена' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось оформить подписку' });
    }
};

export const unsubscribeUser = async (req, res) => {
    try {
        const idSubscribe = req.params.id;
        const userId = req.userId;

        if (!userId || !idSubscribe) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте все необходимые данные' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь, который хочет отписаться, не найден' });
        }

        const subscribeUser = await UserModel.findById(idSubscribe);
        if (!subscribeUser) {
            return res.status(404).json({ message: 'Пользователь, от которого хотят отписаться, не найден' });
        }

        user.subscriptions = user.subscriptions.filter(subId => subId.toString() !== idSubscribe);
        subscribeUser.subscribers = subscribeUser.subscribers.filter(subId => subId.toString() !== userId);

        await user.save();
        await subscribeUser.save();

        res.json({ success: true, message: 'Подписка успешно отменена' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось отменить подписку' });
    }
};

export const getSubscriptionsOrSubscribers = async (req, res) => {
    try {
        const userId = req.params.id;
        const filter = req.params.group;

        if (!userId) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте все необходимые данные' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        let data;
        if (filter === 'subscriptions') {
            data = user.subscriptions;
        } else if (filter === 'subscribers') {
            data = user.subscribers;
        } else {
            return res.status(400).json({ message: 'Неверный фильтр' });
        }

        const usersData = await UserModel.find({ _id: { $in: data } }).select('fullName avatarUrl subscriptions subscribers email');

        res.json(usersData);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить данные' });
    }
};

export const getAllUsers = async (req, res) => {
    try {
        const users = await UserModel.find().select('fullName avatarUrl subscriptions subscribers email');

        res.json(users);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить данные пользователей' });
    }
};

export const getSubscriptions = async (req, res) => {
    try {
        const userId = req.params.id;

        if (!userId) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте ID пользователя' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const subscriptions = await UserModel.find({ _id: { $in: user.subscriptions } }).select('fullName avatarUrl email');

        res.json(subscriptions);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить подписки' });
    }
};

export const getSubscribers = async (req, res) => {
    try {
        const userId = req.params.id;

        if (!userId) {
            return res.status(400).json({ message: 'Пожалуйста, предоставьте ID пользователя' });
        }

        const user = await UserModel.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        const subscribers = await UserModel.find({ _id: { $in: user.subscribers } }).select('fullName avatarUrl email');

        res.json(subscribers);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить подписчиков' });
    }
};