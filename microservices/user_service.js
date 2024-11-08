import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import multer from 'multer';
import {
    registerData,
    registerImage,
    login,
    getUser,
    getMe,
    getAllUsers,
    updateUserData,
    updateUserAvatar,
    subscribeUser,
    unsubscribeUser,
    getSubscriptionsOrSubscribers
} from '../controllers/userController.js';
import {
    registerValidation,
    loginValidation,
    updateUserValidation
} from '../validations.js';
import { handleValidationErrors, checkAuth } from "../utils/index.js";

const app = express();
const PORT = 5001; // Порт для user_service

// Подключение к MongoDB
mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => logToFile("Database Connected Successfully"))
    .catch((err) => logToFile('DB error: ' + err));

// Настройка multer для загрузки файлов
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => {
            const uploadDir = '../uploads';
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (_, file, cb) => {
            cb(null, file.originalname);
        }
    })
});

// Функция для записи логов в файл
const logToFile = (message) => {
    fs.appendFileSync('UserServiceLog.log', message, (err) => {
        if (err) {
            console.error('Error writing to log file', err);
        }
    });
};

// Функция для форматирования заголовков в виде списка
const formatHeaders = (headers) => {
    return Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
};


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
// Логируем все запросы
app.use((req, res, next) => {
    const { method, url, headers, body } = req;
    const startTime = new Date().toISOString();

    // Логируем разделительную линию, время запроса и другие данные
    logToFile(`\n========================================\n`);
    logToFile(`[${startTime}] Request received: ${method} ${url}\n`);
    logToFile(`Headers:\n${formatHeaders(headers)}\n`);
    logToFile(`Body: ${JSON.stringify(body)}\n`);

    const start = new Date();

    // Логируем ответ и время ответа
    res.on('finish', () => {
        const duration = new Date() - start;
        logToFile(`Response: ${res.statusCode} ${res.statusMessage} - Time: ${duration}ms\n`);
        logToFile(`========================================\n`);
    });

    next();
});

// Условная загрузка изображений
const conditionalUpload = (req, res, next) => {
    if (req.file || (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'))) {
        upload.single('image')(req, res, next);
    } else {
        next();
    }
};

// Роуты
app.post('/auth/register/data', registerValidation, handleValidationErrors, registerData);
app.post('/auth/register/image', upload.single('image'), registerImage);
app.post('/auth/login', loginValidation, handleValidationErrors, login);
app.get('/user/:id', getUser);
app.get('/auth/me', checkAuth, getMe);
app.get('/users', getAllUsers);
app.patch('/profile/:id/editData', checkAuth, updateUserValidation, handleValidationErrors, updateUserData);
app.patch('/profile/:id/editImage', checkAuth, conditionalUpload, updateUserAvatar);
app.post('/profile/:id/subscribe', checkAuth, subscribeUser);
app.post('/profile/:id/unsubscribe', checkAuth, unsubscribeUser);
app.get('/profile/:id/:group', getSubscriptionsOrSubscribers);

// Запуск сервера
app.listen(PORT, () => {
    logToFile(`User service running on http://localhost:${PORT}\n`);
});
