import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';
import { checkAuth } from "./utils/index.js";
import FormData from 'form-data';
import cookieParser from 'cookie-parser'; // Добавляем cookie-parser

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Database Connected Successfully"))
    .catch((err) => console.log('DB error', err));

const app = express();
const upload = multer();

// Настройка CORS для gateway
app.use(cors({
    origin: 'http://localhost:3000', // URL вашего клиентского приложения
    credentials: true, // Разрешаем отправку cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Добавляем cookie-parser для gateway
app.use('/uploads', express.static('uploads'));
app.use(upload.any());

// Middleware для обработки preflight запросов
app.options('*', cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Cookies:', JSON.stringify(req.cookies, null, 2)); // Логируем cookies

    if (req.is('multipart/form-data')) {
        console.log('Form fields:');
        for (let key in req.body) {
            console.log(`${key}: ${req.body[key]}`);
        }

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
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }

    next();
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
        notes: 'http://localhost:5001',
        chats: 'http://localhost:5004',
        messages: 'http://localhost:5004'
    };

    let targetServiceUrl = null;

    for (const [prefix, url] of Object.entries(microserviceUrls)) {
        if (req.originalUrl.startsWith(`/${prefix}`)) {
            targetServiceUrl = `${url}${req.originalUrl}`;
            break;
        }
    }

    if (!targetServiceUrl) {
        return next();
    }

    try {
        const axiosConfig = {
            method: req.method,
            url: targetServiceUrl,
            headers: {
                ...req.headers,
                host: new URL(targetServiceUrl).host, // Устанавливаем правильный host
                cookie: req.headers.cookie || '' // Передаем cookies
            },
            withCredentials: true // Важно: разрешаем отправку cookies
        };

        // Удаляем несовместимые заголовки
        delete axiosConfig.headers['content-length'];
        delete axiosConfig.headers['host'];

        if (req.is('multipart/form-data')) {
            const form = new FormData();

            // Добавляем текстовые поля
            for (const [key, value] of Object.entries(req.body)) {
                if (value !== undefined && value !== null) {
                    form.append(key, value.toString());
                }
            }

            // Добавляем файлы
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    form.append(file.fieldname, file.buffer, {
                        filename: file.originalname,
                        contentType: file.mimetype
                    });
                });
            }

            axiosConfig.headers = {
                ...axiosConfig.headers,
                ...form.getHeaders(),
            };
            axiosConfig.data = form;
        } else if (Object.keys(req.body).length > 0) {
            axiosConfig.data = req.body;
            axiosConfig.headers['Content-Type'] = 'application/json';
        }

        if (req.method === 'GET') {
            delete axiosConfig.data;
        }

        console.log('Forwarding to:', axiosConfig.url);
        console.log('Forward headers:', axiosConfig.headers);

        const response = await axios(axiosConfig);

        // Копируем cookies из ответа микросервиса в ответ gateway
        if (response.headers['set-cookie']) {
            res.setHeader('Set-Cookie', response.headers['set-cookie']);
        }

        res.status(response.status).json(response.data);

    } catch (error) {
        console.error('Error forwarding request:', error.message);
        console.error('Error details:', error.response?.data);

        if (error.response) {
            // Копируем cookies из ошибки микросервиса
            if (error.response.headers['set-cookie']) {
                res.setHeader('Set-Cookie', error.response.headers['set-cookie']);
            }
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ message: 'Internal server error' });
        }
    }
});

app.listen(4444, (err) => {
    if (err) {
        return console.error(err);
    }
    console.log('Gateway server started on port 4444');
});