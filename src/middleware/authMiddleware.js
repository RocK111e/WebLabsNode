// src/middleware/authMiddleware.js
const extractJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        req.jwtToken = authHeader.substring(7);
    } else {
        req.jwtToken = null;
    }
    next();
};

module.exports = { extractJwt };