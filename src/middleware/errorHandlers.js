// src/middleware/errorHandlers.js
const routeNotFoundHandler = (req, res, next) => {
    res.status(404).json({ error: 'Route not found.' });
};

const globalErrorHandler = (err, req, res, next) => {
  console.error("Global Error Handler:", err.message, err.stack);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error.' });
};

module.exports = {
    routeNotFoundHandler,
    globalErrorHandler
};