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
    createNote,
    uploadNoteFiles,
    getUserNotes,
    searchNotes,
    deleteNote
} from '../controllers/noteController.js';
import {
    registerValidation,
    loginValidation,
    updateUserValidation
} from '../validations.js';
import { handleValidationErrors, checkAuth } from "../utils/index.js";

const app = express();
const PORT = 5001;

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => logToFile("Database Connected Successfully"))
    .catch((err) => logToFile('DB error: ' + err));

// Настройка multer для загрузки аватаров пользователей
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

// Настройка multer для загрузки файлов заметок
const noteUpload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => {
            const uploadDir = '../uploads/notes';
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

// Middleware для парсинга multipart/form-data
const parseFormData = multer().none();

const logToFile = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync('UserServiceLog.log', logMessage, (err) => {
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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.use((req, res, next) => {
    const { method, url, headers, body } = req;
    const startTime = new Date().toISOString();

    logToFile(`\n========================================`);
    logToFile(`[${startTime}] Request received: ${method} ${url}`);
    logToFile(`Headers:\n${formatHeaders(headers)}`);
    logToFile(`Body: ${JSON.stringify(body, null, 2)}`);
    logToFile(`Content-Type: ${headers['content-type']}`);

    const start = new Date();

    res.on('finish', () => {
        const duration = new Date() - start;
        logToFile(`Response: ${res.statusCode} ${res.statusMessage} - Time: ${duration}ms`);
        logToFile(`========================================\n`);
    });

    next();
});

const conditionalUpload = (req, res, next) => {
    if (req.file || (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'))) {
        upload.single('image')(req, res, next);
    } else {
        next();
    }
};

// Существующие роуты
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

app.post('/notes/:userId/create', checkAuth, parseFormData, createNote);
app.post('/notes/:userId/upload-files', checkAuth, noteUpload.array('files'), uploadNoteFiles);
app.get('/notes/:userId', checkAuth, getUserNotes);
app.get('/notes/:userId/search', checkAuth, searchNotes);
app.delete('/notes/:noteId', checkAuth, deleteNote);

app.listen(PORT, () => {
    logToFile(`User service running on http://localhost:${PORT}`);
});