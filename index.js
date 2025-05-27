// index.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors'); // <--- IMPORT CORS MIDDLEWARE

const MongoDB = require('./src/database/database'); // Ensure this path is correct
const MessageController = require('./src/controllers/messages'); // Ensure this path is correct
const ChatController = require('./src/controllers/chats'); // Ensure this path is correct
const { fetchUserDetails } = require('./src/utils/externalUserApi'); // Ensure this path is correct
require('./src/logger/logger.js'); // Your custom logger, ensure this path is correct

const app = express();
const server = http.createServer(app);

// Socket.IO Server with its own CORS configuration
const io = new Server(server, {
  cors: {
    origin: "*", // Configure for production (e.g., 'http://your-frontend-domain.com')
    methods: ["GET", "POST"]
    // credentials: true // Uncomment if your frontend socket client sends credentials
  }
});

// --- Express Middlewares ---
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// --- CORS MIDDLEWARE FOR EXPRESS REST APIs ---
// This should be placed BEFORE your API route definitions.
// This allows your REST API (e.g., /messages, /chats) to accept cross-origin requests.
const corsOptions = {
  origin: '*', // For development, allow all. For production, specify your frontend domain: 'http://your-frontend.com'
  methods: "GET,POST,PUT,DELETE,OPTIONS", // Specify methods your API supports
  allowedHeaders: "Content-Type,Authorization,X-Requested-With", // Specify headers your client might send
  // credentials: true, // Uncomment if your frontend sends credentials (cookies, auth headers) AND origin is NOT '*'
  optionsSuccessStatus: 204 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions)); // Apply CORS to all Express routes

// --- Database Initialization ---
const dbInstance = new MongoDB(); // Assuming MongoDB class handles connection internally

// --- Middleware to extract JWT for REST APIs ---
const extractJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        req.jwtToken = authHeader.substring(7); // Correctly get token after "Bearer "
    } else {
        req.jwtToken = null;
    }
    next();
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  // Extract token from handshake for socket events
  const jwtToken = socket.handshake.auth.token;
  if (!jwtToken) {
    console.warn(`Socket ${socket.id} connected without JWT. Fetching user details will fail for socket events.`);
    // Optionally disconnect if token is strictly required for all socket actions:
    // socket.emit('auth_error', { message: 'Authentication token missing.' });
    // socket.disconnect();
    // return;
  }
  socket.jwtToken = jwtToken; // Store token on the socket object

  socket.on('joinChat', (chatId) => {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      console.error(`Socket ${socket.id} tried to join invalid chatId: ${chatId}`);
      socket.emit('error', { message: 'Invalid chatId provided for joinChat.' });
      return;
    }
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat room: ${chatId}`);
    socket.emit('joinedChat', { chatId }); // Acknowledge joining
  });

  socket.on('leaveChat', (chatId) => {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      console.error(`Socket ${socket.id} tried to leave invalid chatId: ${chatId}`);
      return;
    }
    socket.leave(chatId);
    console.log(`Socket ${socket.id} left chat room: ${chatId}`);
    socket.emit('leftChat', { chatId }); // Acknowledge leaving
  });

  socket.on('sendMessage', async (data) => {
    const { chatId, senderExternalId, message } = data;
    const token = socket.jwtToken; // Use token stored on socket

    console.log(`sendMessage event from ${socket.id}:`, { chatId, senderExternalId, message: message ? message.substring(0, 20) + '...' : 'empty' });

    if (!token) {
        console.warn(`Socket ${socket.id} trying to send message without token.`);
        socket.emit('messageError', { chatId, error: 'Authentication token not found. Cannot send message.' });
        return;
    }
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId) || !senderExternalId || !message) {
      console.error('Invalid data for sendMessage:', { chatId, senderExternalId, message: '...' });
      socket.emit('messageError', { chatId, error: 'Missing chatId, senderExternalId, or message content.' });
      return;
    }

    try {
      // Fetch user details using the token stored on the socket
      const userDetails = await fetchUserDetails(senderExternalId, token);
      const senderUsername = userDetails && userDetails.name ? userDetails.name : `User (${senderExternalId.substring(0,4)})`;

      const result = await dbInstance.post_message(chatId, senderExternalId, senderUsername, message);

      if (result.success && result.data) {
        io.to(chatId).emit('newMessage', result.data); // Broadcast to everyone in the chat room
        console.log(`Message broadcast to room ${chatId}:`, { ...result.data, message: message ? message.substring(0,20)+'...' : 'empty' });
      } else {
        console.error('Failed to save message to DB:', result.error);
        socket.emit('messageError', { chatId, error: 'Failed to send message. Could not save to database.' });
      }
    } catch (error) {
      console.error('Error processing sendMessage:', error.message, error.stack);
      socket.emit('messageError', { chatId, error: 'Server error while sending message.' });
    }
  });

  socket.on('typing', async (data) => {
    const { chatId, isTyping, externalUserId } = data;
    const token = socket.jwtToken; // Use token stored on socket

    if (chatId && externalUserId && token) {
        try {
            const userDetails = await fetchUserDetails(externalUserId, token);
            const username = userDetails && userDetails.name ? userDetails.name : `User (${externalUserId.substring(0,4)})`;
            socket.to(chatId).emit('userTyping', { username, isTyping, chatId });
        } catch (error) {
            console.error('Error fetching user details for typing event:', error.message);
            // Optionally emit an error or just proceed without username enhancement
            socket.to(chatId).emit('userTyping', { username: `User (${externalUserId.substring(0,4)})`, isTyping, chatId });
        }
    } else if (chatId && data.username) { // Fallback if only username is sent (less secure, consider removing)
         console.warn(`Typing event received with username fallback for chat ${chatId}`);
         socket.to(chatId).emit('userTyping', { username: data.username, isTyping, chatId });
    } else {
        console.warn('Typing event received with insufficient data:', data);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => { // Catch general socket errors
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// --- REST API Routes ---
// These routes will automatically have CORS headers applied by `app.use(cors(corsOptions))`
const MC = new MessageController();
const CC = new ChatController();

// Health check / Welcome route
app.get('/', (req, res) => {
  console.log('Request received at /');
  res.status(200).send('Welcome to the WebBackendNode Chat & Message API!');
});

// Create a new message via HTTP
// Your Apache ProxyPass should direct requests like /messages (or /api/messages) here.
app.post('/messages', extractJwt, async (req, res) => {
    console.log('POST /messages (HTTP)', { body: req.body, jwtPresent: !!req.jwtToken });
    if (!req.jwtToken) {
        return res.status(401).json({ error: "Authorization header with Bearer token is required." });
    }
    const result = await MC.post_message_http(req.body, dbInstance, req.jwtToken);
    // If message created successfully, broadcast via Socket.IO
    if (result[0] === 201 && result[1].success && result[1].data && result[1].data.chatId) {
        io.to(result[1].data.chatId.toString()).emit('newMessage', result[1].data);
    }
    res.status(result[0]).json(result[1]);
});

// Get messages for a specific chat
app.get('/chats/:chatId/messages', extractJwt, async (req, res) => {
    const { chatId } = req.params;
    console.log(`GET /chats/${chatId}/messages`, { query: req.query, jwtPresent: !!req.jwtToken });
    if (!req.jwtToken) {
        return res.status(401).json({ error: "Authorization header with Bearer token is required." });
    }
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return res.status(400).json({ error: "Invalid chatId format." });
    }
    const result = await MC.get_chat_messages(chatId, req.query, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

// Create a new chat
app.post('/chats', async (req, res) => { // Assuming chat creation might not always require JWT initially
    console.log('POST /chats', { body: req.body });
    const result = await CC.create_chat(req.body, dbInstance);
    res.status(result[0]).json(result[1]);
});

// Get chats for a specific external user ID
app.get('/chats/user/:externalUserId', extractJwt, async (req, res) => {
    const { externalUserId } = req.params;
    console.log(`GET /chats/user/${externalUserId}`, { jwtPresent: !!req.jwtToken });
    if (!req.jwtToken) {
        return res.status(401).json({ error: "Authorization header with Bearer token is required." });
    }
    const result = await CC.get_chats_for_external_user(externalUserId, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

// --- 404 Handler ---
// This should be after all your valid routes
app.use((req, res, next) => {
    const log_message = `404 - Route Not Found: ${req.method} ${req.originalUrl}`;
    console.warn(log_message);
    res.status(404).json({ error: 'Route not found on this server.' });
});

// --- Global Error Handler ---
// This should be the last middleware
app.use((err, req, res, next) => {
  console.error("Unhandled application error:", err.message, err.stack || err);
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
                    ? 'An internal server error occurred.' // Generic message for production
                    : err.message || 'An unexpected error occurred.';
  res.status(statusCode).json({ error: message });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server with Express API and Socket.IO running at http://localhost:${PORT}/`);
  if (dbInstance && typeof dbInstance.connect === 'function') { // Optional: attempt connection if dbInstance has a connect method
    dbInstance.connect().catch(err => console.error("Initial DB connection attempt failed:", err));
  }
});

// Optional: Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  io.close(() => {
    console.log('Socket.IO server closed.');
  });
  server.close(async () => {
    console.log('HTTP server closed.');
    if (dbInstance && typeof dbInstance.disconnect === 'function') {
      await dbInstance.disconnect();
      console.log('MongoDB disconnected.');
    }
    process.exit(0);
  });

  // Force shutdown if not closed within a timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds
});