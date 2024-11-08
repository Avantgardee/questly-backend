import { body} from "express-validator";
export const registerValidation = [
    body('email', 'Некорректный формат почты').isEmail(),
    body('password', 'Пароль должен состоять миниму из 5 символов').isLength({min: 5}),
    body('fullName', 'Имя должно состоять минимум из 3 символов').isLength({min: 3}),
];

export const updateUserValidation = [
    body('fullName', 'Имя должно состоять минимум из 3 символов').isLength({min: 3}),
];

export const loginValidation = [
    body('email', 'Некорректный формат почты').isEmail(),
    body('password', 'Пароль должен состоять миниму из 5 символов').isLength({min: 5}),
];

export const postCreateValidation = [
   body('title', 'Введите заголовки статьи').isLength({min: 3}).isString(),
    body('text', 'Введите текст статьи').isLength({min: 10}).isString(),
    body('tags', 'Неверный формат тэгов (укажите массив)').optional().isArray(),
    body('imageUrl','Неверная ссылка на изображения').optional().isString(),
];

export const commentCreateValidation = [
    body('text', 'Введите текст статьи').isLength({min: 1}).isString(),
];

export const notificationCreateValidation = [
    body('action').isIn(['post', 'comment', 'subscribe']).withMessage('Invalid action type'),
    body('post').optional().isMongoId().withMessage('Invalid post ID format'),
];