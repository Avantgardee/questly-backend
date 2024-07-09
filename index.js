import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import cors from 'cors';
import {
    registerValidation,
    loginValidation,
    postCreateValidation,
    commentCreateValidation,
    updateUserValidation
} from './validations.js'

import {UserController, PostController, CommentController} from "./controllers/index.js";

import {handleValidationErrors, checkAuth} from "./utils/index.js";
import {getSubscriptionsOrSubscribers, subscribeUser} from "./controllers/userController.js";

mongoose.connect("mongodb+srv://admin:wwwwww@cluster0.0qdhldu.mongodb.net/blog?retryWrites=true&w=majority&appName=Cluster0")
    .then(()=> console.log("Database Connected Successfully"))
    .catch((err)=>console.log('DB error', err));

const app = express();

const storage = multer.diskStorage({
    destination: (_, __, cb) => {
        cb(null, 'uploads');
    },
    filename: (_, file, cb) => {
        cb(null, file.originalname);
    }
});

const conditionalUpload = (req, res, next) => {
    if (req.file || (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data'))) {
        upload.single('image')(req, res, next);
    } else {
        next();
    }
};

const upload = multer({ storage});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/uploads', express.static('uploads'));
app.post('/auth/register/data', registerValidation,handleValidationErrors,  UserController.registerData);
app.post('/auth/register/image',upload.single('image'),  UserController.registerImage);
app.post('/auth/login', loginValidation, handleValidationErrors, UserController.login);
app.get('/user/:id', UserController.getUser);
app.get('/auth/me', checkAuth,UserController.getMe);

app.get('/users',UserController.getAllUsers);
app.patch('/profile/:id/editData', checkAuth, updateUserValidation,handleValidationErrors,  UserController.updateUserData);
app.patch('/profile/:id/editImage', checkAuth, conditionalUpload,  UserController.updateUserAvatar);
app.post('/profile/:id/subscribe',checkAuth,  UserController.subscribeUser);
app.post('/profile/:id/unsubscribe',checkAuth,  UserController.unsubscribeUser);
app.get('/profile/:id/:group',  UserController.getSubscriptionsOrSubscribers);

app.post('/upload',checkAuth, upload.single('image'), (req, res) => {
    res.json({
        url: `/uploads/${req.file.originalname}`,
    });
});
app.get('/posts',PostController.getAll);
app.get('/posts/sort/:id/:how/:str?', PostController.getAllWithFilter);
app.get('/posts/sortWithSubscriptions/:id/:how/:str?',checkAuth, PostController.getAllPostsFromSubscriptions);
app.get('/posts/:id',PostController.getOne);
app.get('/tags/:id',PostController.getAllWithTag);
app.get('/posts/user/:id',PostController.getAllWithUser);
app.get('/posts/comments/:id',PostController.getPostComments);
app.get('/tags',PostController.getPopularTags);
app.post('/posts',checkAuth, postCreateValidation,handleValidationErrors,PostController.create);
app.delete('/posts/:id',checkAuth, PostController.remove);
app.patch('/posts/:id',checkAuth, postCreateValidation,handleValidationErrors,PostController.update);
app.post('/comments/:id',checkAuth,commentCreateValidation,handleValidationErrors, CommentController.createComment )

app.listen(4444,(err) => {
    if (err) {
        return console.error(err);
    }
    console.log('Server started on port 4444');
});

