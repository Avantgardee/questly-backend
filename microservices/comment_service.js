import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import { checkAuth, handleValidationErrors } from '../utils/index.js';
import { createComment } from '../controllers/commentController.js';
import { commentCreateValidation } from '../validations.js';

// Подключение к базе данных MongoDB
mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => logToFile("Microservice Database Connected Successfully"))
    .catch((err) => logToFile('DB error: ' + err));

const app = express();

// Функция для записи логов в файл
const logToFile = (message) => {
    fs.appendFileSync('CommentService.log', message, (err) => {
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
app.post('/comments/:id', checkAuth, commentCreateValidation, handleValidationErrors, createComment);

// Запуск микросервиса
app.listen(5002, (err) => {
    if (err) {
        logToFile('Error starting the microservice: ' + err);
        return console.error(err);
    }
    logToFile('Comment microservice started on port 5002\n');
});
