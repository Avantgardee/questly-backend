import MessageModel from '../models/Message.js';
import ChatModel from '../models/Chat.js';
import UserModel from "../models/user.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { sendToRabbitMQ } from './rabbitmq.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const deleteMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.userId;

        if (!messageId) {
            return res.status(400).json({ message: 'Укажите ID сообщения' });
        }

        const message = await MessageModel.findById(messageId)
            .populate('chat', 'participants');

        if (!message) {
            return res.status(404).json({ message: 'Сообщение не найдено' });
        }

        const isSender = message.sender.toString() === userId;
        const isParticipant = message.chat.participants.some(p => p.toString() === userId);

        if (!isSender && !isParticipant) {
            return res.status(403).json({ message: 'Нет прав для удаления сообщения' });
        }

        if (message.attachments && message.attachments.length > 0) {
            message.attachments.forEach(filePath => {
                const fullPath = path.join(__dirname, '..', filePath.startsWith('/') ? filePath.substring(1) : filePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            });
        }

        await MessageModel.findByIdAndDelete(messageId);

        const chat = await ChatModel.findById(message.chat._id);
        if (chat.lastMessage && chat.lastMessage.toString() === messageId) {
            const lastMessage = await MessageModel.findOne(
                { chat: message.chat._id },
                {},
                { sort: { createdAt: -1 } }
            );

            chat.lastMessage = lastMessage ? lastMessage._id : null;
            await chat.save();
        }

        res.json({ success: true, message: 'Сообщение удалено' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось удалить сообщение' });
    }
};

export const deleteChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.userId;

        if (!chatId) {
            return res.status(400).json({ message: 'Укажите ID чата' });
        }

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: userId
        });

        if (!chat) {
            return res.status(404).json({ message: 'Чат не найден или доступ запрещен' });
        }

        const messages = await MessageModel.find({ chat: chatId });

        messages.forEach(message => {
            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach(filePath => {
                    const fullPath = path.join(__dirname, '..', filePath.startsWith('/') ? filePath.substring(1) : filePath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                });
            }
        });

        await MessageModel.deleteMany({ chat: chatId });

        await ChatModel.findByIdAndDelete(chatId);

        res.json({ success: true, message: 'Чат удален' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось удалить чат' });
    }
};

export const clearChat = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.userId;

        if (!chatId) {
            return res.status(400).json({ message: 'Укажите ID чата' });
        }

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: userId
        });

        if (!chat) {
            return res.status(404).json({ message: 'Чат не найден или доступ запрещен' });
        }

        const messages = await MessageModel.find({ chat: chatId });

        messages.forEach(message => {
            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach(filePath => {
                    const fullPath = path.join(__dirname, '..', filePath.startsWith('/') ? filePath.substring(1) : filePath);
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                });
            }
        });

        await MessageModel.deleteMany({ chat: chatId });

        chat.lastMessage = null;
        await chat.save();

        res.json({ success: true, message: 'Чат очищен' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось очистить чат' });
    }
};

export const editMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { text } = req.body;
        const userId = req.userId;

        if (!messageId || !text) {
            return res.status(400).json({ message: 'Укажите ID сообщения и текст' });
        }

        const message = await MessageModel.findById(messageId);

        if (!message) {
            return res.status(404).json({ message: 'Сообщение не найдено' });
        }

        if (message.sender.toString() !== userId) {
            return res.status(403).json({ message: 'Можно редактировать только свои сообщения' });
        }

        const messageAge = Date.now() - new Date(message.createdAt).getTime();
        const fifteenMinutes = 15 * 60 * 1000;

        if (messageAge > fifteenMinutes) {
            return res.status(400).json({ message: 'Можно редактировать только сообщения младше 15 минут' });
        }

        message.text = text;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();

        await message.populate('sender', 'fullName avatarUrl');

        res.json(message);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось отредактировать сообщение' });
    }
};

export const createChat = async (req, res) => {
    try {
        const { participantId } = req.body;
        const userId = req.userId;

        if (!participantId) {
            return res.status(400).json({ message: 'Укажите участника чата' });
        }

        const existingChat = await ChatModel.findOne({
            participants: { $all: [userId, participantId] }
        }).populate('participants', 'fullName avatarUrl');

        if (existingChat) {
            const chatObject = existingChat.toObject();
            chatObject.unreadCount = Object.fromEntries(chatObject.unreadCount || []);
            return res.json(chatObject);
        }

        const unreadCount = new Map();
        unreadCount.set(userId, 0);
        unreadCount.set(participantId, 0);

        const chat = new ChatModel({
            participants: [userId, participantId],
            unreadCount: unreadCount
        });

        await chat.save();
        await chat.populate('participants', 'fullName avatarUrl');

        const chatObject = chat.toObject();
        chatObject.unreadCount = Object.fromEntries(chatObject.unreadCount);

        res.json(chatObject);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось создать чат' });
    }
};

export const getUserChats = async (req, res) => {
    try {
        const userId = req.userId;

        const chats = await ChatModel.find({
            participants: userId
        })
            .populate('participants', 'fullName avatarUrl')
            .populate({
                path: 'lastMessage',
                populate: {
                    path: 'sender',
                    select: 'fullName avatarUrl'
                }
            })
            .sort({ updatedAt: -1 });

        const chatsWithUnreadCount = chats.map(chat => {
            const chatObject = chat.toObject();
            chatObject.unreadCount = Object.fromEntries(chatObject.unreadCount || []);
            return chatObject;
        });

        res.json(chatsWithUnreadCount);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить чаты' });
    }
};

export const getChatMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.userId;

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: userId
        });

        if (!chat) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        const messages = await MessageModel.find({ chat: chatId })
            .populate('sender', 'fullName avatarUrl')
            .sort({ createdAt: 1 });

        await MessageModel.updateMany(
            {
                chat: chatId,
                sender: { $ne: userId },
                readBy: { $ne: userId }
            },
            {
                $addToSet: { readBy: userId },
                status: 'read'
            }
        );

        res.json(messages);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить сообщения' });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const { chatId, text } = req.body;
        const userId = req.userId;
        const attachments = req.files ? req.files.map(file => `/uploads/messages/${file.filename}`) : [];

        if (!chatId) {
            return res.status(400).json({ message: 'Укажите ID чата' });
        }

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: userId
        });

        if (!chat) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        const message = new MessageModel({
            chat: chatId,
            sender: userId,
            text,
            attachments
        });

        await message.save();
        await message.populate('sender', 'fullName avatarUrl');

        chat.lastMessage = message._id;
        chat.updatedAt = new Date();
        await chat.save();

        const recipient = chat.participants.find(id => id.toString() !== userId);
        await sendToRabbitMQ({
            action: 'message',
            actionByUser: userId,
            actionOnUser: recipient,
            chatId: chatId,
            messageId: message._id
        }, 'message');

        res.json(message);
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось отправить сообщение' });
    }
};

export const uploadMessageFiles = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'Файлы не загружены' });
        }

        const fileUrls = req.files.map(file => `/uploads/messages/${file.filename}`);
        res.json({ success: true, fileUrls });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось загрузить файлы' });
    }
};

export const getChatFiles = async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.userId;

        if (!chatId) {
            return res.status(400).json({ message: 'Укажите ID чата' });
        }

        const chat = await ChatModel.findOne({
            _id: chatId,
            participants: userId
        });

        if (!chat) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        const messages = await MessageModel.find({ 
            chat: chatId,
            attachments: { $exists: true, $ne: [] }
        })
            .populate('sender', 'fullName avatarUrl')
            .select('attachments sender createdAt')
            .sort({ createdAt: -1 });

        const files = [];
        messages.forEach(message => {
            if (message.attachments && message.attachments.length > 0) {
                message.attachments.forEach(filePath => {
                    const fileName = filePath.split('/').pop();
                    const fileExtension = fileName.split('.').pop()?.toLowerCase();
                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);
                    
                    files.push({
                        url: filePath,
                        fileName: fileName,
                        fileType: fileExtension,
                        isImage: isImage,
                        sender: message.sender,
                        createdAt: message.createdAt,
                        messageId: message._id
                    });
                });
            }
        });

        res.json({ success: true, files });
    } catch (err) {
        console.log(err);
        res.status(500).json({ message: 'Не удалось получить файлы' });
    }
};