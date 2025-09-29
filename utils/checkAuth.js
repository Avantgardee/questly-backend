import jwt from 'jsonwebtoken';

export default (req, res, next) => {
    // Получаем токен из cookies
    const token = req.cookies.token;

    if (token) {
        try {
            const decoded = jwt.verify(token, 'secret123');
            req.userId = decoded._id;
            next();
        } catch (err) {
            // Очищаем невалидный токен
            res.clearCookie('token');
            return res.status(401).json({
                message: 'Требуется авторизация'
            });
        }
    } else {
        return res.status(401).json({
            message: 'Требуется авторизация'
        });
    }
};