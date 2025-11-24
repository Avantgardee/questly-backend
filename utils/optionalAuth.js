import jwt from 'jsonwebtoken';

// Опциональная авторизация - устанавливает req.userId если токен есть,
// но не требует обязательной авторизации
export default (req, res, next) => {
    // Получаем токен из cookies
    const token = req.cookies.token;

    if (token) {
        try {
            const decoded = jwt.verify(token, 'secret123');
            req.userId = decoded._id;
        } catch (err) {
            // Если токен невалидный, просто очищаем его и продолжаем без userId
            res.clearCookie('token');
            req.userId = undefined;
        }
    }
    
    // Всегда продолжаем выполнение, даже если токена нет
    next();
};

