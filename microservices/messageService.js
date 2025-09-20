import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import {
    createChat,
    getUserChats,
    getChatMessages,
    sendMessage,
    uploadMessageFiles,
    deleteMessage,
    deleteChat,
    clearChat,
    editMessage
} from '../controllers/messageController.js';
import { messageValidation } from '../validations.js';
import { handleValidationErrors, checkAuth } from "../utils/index.js";
const app = express();
const PORT = 5004;

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => logToFile("Message Service: Database Connected Successfully"))
    .catch((err) => logToFile('Message Service: DB error: ' + err));

// Настройка multer для загрузки файлов сообщений
const messageUpload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => {
            const uploadDir = '../uploads/messages';
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (_, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname);
        }
    })
});

const logToFile = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync('MessageServiceLog.log', logMessage, (err) => {
        if (err) {
            console.error('Error writing to log file', err);
        }
    });
};

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/uploads', express.static('uploads'));

app.use((req, res, next) => {
    const { method, url, headers } = req;
    const startTime = new Date().toISOString();

    logToFile(`\n========================================`);
    logToFile(`[${startTime}] Message Service Request: ${method} ${url}`);
    logToFile(`Headers: ${JSON.stringify(headers, null, 2)}`);
    logToFile(`Cookies: ${JSON.stringify(req.cookies, null, 2)}`);

    const start = new Date();
    res.on('finish', () => {
        const duration = new Date() - start;
        logToFile(`Response: ${res.statusCode} ${res.statusMessage} - Time: ${duration}ms`);
        logToFile(`========================================\n`);
    });

    next();
});

// Роуты для сообщений
app.post('/chats/create', checkAuth, createChat);
app.get('/chats', checkAuth, getUserChats);
app.get('/chats/:chatId/messages', checkAuth, getChatMessages);
app.post('/messages/send', checkAuth, messageValidation, handleValidationErrors, sendMessage);
app.post('/messages/upload-files', checkAuth, messageUpload.array('files'), uploadMessageFiles);

// Новые роуты для удаления и редактирования
app.delete('/messages/:messageId', checkAuth, deleteMessage);
app.delete('/chats/:chatId', checkAuth, deleteChat);
app.delete('/chats/:chatId/clear', checkAuth, clearChat);
app.patch('/messages/:messageId', checkAuth, editMessage);

app.listen(PORT, () => {
    logToFile(`Message service running on http://localhost:${PORT}`);
});