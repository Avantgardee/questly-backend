import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';

import {  checkAuth } from "./utils/index.js";
import FormData from 'form-data';
// Подключение к базе данных MongoDB
mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Database Connected Successfully"))
    .catch((err) => console.log('DB error', err));

const app = express();
const upload = multer();


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));
app.use(upload.any());
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));

    if (req.is('multipart/form-data')) {
        // Логгирование полей формы
        console.log('Form fields:');
        for (let key in req.body) {
            console.log(`${key}: ${req.body[key]}`);
        }

        // Логгирование файлов
        if (req.files && req.files.length > 0) {
            console.log('Uploaded files:');
            req.files.forEach(file => {
                console.log(`File fieldname: ${file.fieldname}`);
                console.log(`Original filename: ${file.originalname}`);
                console.log(`Mimetype: ${file.mimetype}`);
                console.log(`Size: ${file.size}`);
            });
        } else {
            console.log('No files uploaded.');
        }
    } else if (req.body) {
        // Логгирование тела запроса, если это не form-data
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }

    next(); // Передача управления следующему middleware
});


app.use(async (req, res, next) => {
    const microserviceUrls = {
        user: 'http://localhost:5001',
        auth: 'http://localhost:5001',
        profile: 'http://localhost:5001',
        users: 'http://localhost:5001',
        posts: 'http://localhost:5000',
        tags: 'http://localhost:5000',
        comments: 'http://localhost:5002',
        notifications: 'http://localhost:5003',
    };

    let targetServiceUrl = null;

    // Определяем, к какому микросервису перенаправлять запрос
    for (const [prefix, url] of Object.entries(microserviceUrls)) {
        if (req.originalUrl.startsWith(`/${prefix}`)) {
            targetServiceUrl = `${url}${req.originalUrl}`;
            break;
        }
    }

    if (!targetServiceUrl) {
        return next(); // Если URL не соответствует ни одному из микросервисов, передаем управление дальше
    }

    try {
        const axiosConfig = {
            method: req.method,
            url: targetServiceUrl,
            headers: { ...req.headers }
        };

        // Если запрос multipart/form-data, формируем данные с использованием form-data
        if (req.is('multipart/form-data')) {
            const form = new FormData();

            // Используйте Object.entries для получения ключей и значений
            for (const [key, value] of Object.entries(req.body)) {
                form.append(key, value);
            }

            // Добавляем файлы
            req.files.forEach(file => {
                form.append(file.fieldname, file.buffer, file.originalname);
            });

            axiosConfig.headers = {
                ...axiosConfig.headers,
                ...form.getHeaders(), // Устанавливаем заголовки для multipart данных
            };
            axiosConfig.data = form;
        } else {
            axiosConfig.data = req.body; // Для остальных типов запросов (JSON и т.д.)
        }

        // Убедитесь, что для GET запросов нет данных в теле
        if (req.method === 'GET') {
            delete axiosConfig.data;
        }

        delete axiosConfig.headers['content-length']; // Удаляем content-length

        const response = await axios(axiosConfig);

        // Возвращаем ответ от микросервиса
        res.status(response.status).json(response.data);

    } catch (error) {
        console.error('Error forwarding request:', error.message);

        // Если ошибка произошла на стороне микросервиса, передаем его ответ
        if (error.response) {
            console.error('Response error data:', error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else {
            // Если ошибка произошла на уровне сети или конфигурации
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});



//Роуты для загрузки изображений
// app.post('/upload', checkAuth, upload.single('image'), (req, res) => {
//     res.json({
//         url: `/uploads/${req.file.originalname}`,
//     });
// });


// Запуск сервера
app.listen(4444, (err) => {
    if (err) {
        return console.error(err);
    }
    console.log('Gateway server started on port 4444');
});
