import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fs from 'fs';
import { checkAuth, handleValidationErrors } from '../utils/index.js';
import { createComment } from '../controllers/commentController.js';
import { commentCreateValidation } from '../validations.js';
import cookieParser from 'cookie-parser';

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => logToFile("Microservice Database Connected Successfully"))
    .catch((err) => logToFile('DB error: ' + err));

const app = express();

const logToFile = (message) => {
    const logsDir = '../logs';
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(`${logsDir}/CommentService.log`, message, (err) => {
        if (err) {
            console.error('Error writing to log file', err);
        }
    });
};

const formatHeaders = (headers) => {
    return Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
};

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cookie']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.options('*', cors({
    origin: 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cookie']
}));

app.use((req, res, next) => {
    const { method, url, headers, body } = req;
    const startTime = new Date().toISOString();

    logToFile(`\n========================================\n`);
    logToFile(`[${startTime}] Request received: ${method} ${url}\n`);
    logToFile(`Headers:\n${formatHeaders(headers)}\n`);
    logToFile(`Body: ${JSON.stringify(body)}\n`);
    logToFile(`Cookies: ${JSON.stringify(req.cookies, null, 2)}\n`);

    const start = new Date();

    res.on('finish', () => {
        const duration = new Date() - start;
        logToFile(`Response: ${res.statusCode} ${res.statusMessage} - Time: ${duration}ms\n`);
        logToFile(`========================================\n`);
    });

    next();
});

app.post('/comments/:id', checkAuth, commentCreateValidation, handleValidationErrors, createComment);

app.listen(5002, (err) => {
    if (err) {
        logToFile('Error starting the microservice: ' + err);
        return console.error(err);
    }
    logToFile('Comment microservice started on port 5002\n');
});