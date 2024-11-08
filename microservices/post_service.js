import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { checkAuth, handleValidationErrors } from '../utils/index.js';
import {
    getPopularTags,
    getAllWithTag,
    getAllWithUser,
    create,
    addImage,
    getAll,
    getPostComments,
    getAllWithFilter,
    getAllPostsFromSubscriptions,
    getOne,
    remove,
    update,
    updateImage
} from '../controllers/postController.js';
import { postCreateValidation } from '../validations.js';
import multer from 'multer';
import fs from "fs";
import {updateUserAvatar} from "../controllers/userController.js";

// Подключение к базе данных MongoDB
mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Microservice Database Connected Successfully"))
    .catch((err) => console.log('DB error', err));

const app = express();
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => {
            const uploadDir = '../uploads'; // Устанавливаем новый путь
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true }); // Создаем директорию с учетом вложенных папок
            }
            cb(null, uploadDir); // Указываем путь к директории
        },
        filename: (_, file, cb) => {
            cb(null, file.originalname);
        }
    })
});
// Middleware для обработки тела запроса
const logToFile = (message) => {
    fs.appendFileSync('PostService.log', message, (err) => {
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

// Middleware для обработки тела запроса
app.use(express.json());
app.use(cors({
    origin: '*',  // Откройте для всех источников на время отладки
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.urlencoded({ extended: true }));

const conditionalUpload = (req, res, next) => {
    if (req.file || (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'))) {
        upload.single('image')(req, res, next);
    } else {
        next();
    }
};

// Middleware для логирования входящих запросов
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
// Маршруты
app.get('/posts', getAll);
app.get('/posts/sort/:id/:how/:str?', getAllWithFilter);
app.get('/posts/sortWithSubscriptions/:id/:how/:str?', checkAuth, getAllPostsFromSubscriptions);
app.get('/posts/:id', getOne);
app.get('/tags/:id', getAllWithTag);
app.get('/posts/user/:id', getAllWithUser);
app.get('/posts/comments/:id', getPostComments);
app.get('/tags', getPopularTags);
app.post('/posts/data', checkAuth, postCreateValidation, handleValidationErrors, create);
app.post('/posts/image', upload.single('image'), addImage);
app.delete('/posts/:id', checkAuth, remove);
app.patch('/posts/data/:id', checkAuth, postCreateValidation, handleValidationErrors, update);
app.patch('/posts/image/:id', checkAuth, conditionalUpload, updateImage);
// Запуск микросервиса
app.listen(5000, (err) => {
    if (err) {
        return console.error(err);
    }
    console.log('Microservice started on port 5000');
});