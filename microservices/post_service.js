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
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(() => console.log("Microservice Database Connected Successfully"))
    .catch((err) => console.log('DB error', err));

const app = express();
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, cb) => {
            const uploadDir = path.join(__dirname, '..', 'uploads');
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

const logToFile = (message) => {
    const logsDir = '../logs';
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(`${logsDir}/PostService.log`, message, (err) => {
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

const conditionalUpload = (req, res, next) => {
    if (req.file || (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'))) {
        upload.single('image')(req, res, next);
    } else {
        next();
    }
};

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

app.listen(5000, (err) => {
    if (err) {
        return console.error(err);
    }
    console.log('Microservice started on port 5000');
});