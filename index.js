// index.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatController = require('./src/controllers/chats');
const { fetchUserDetails } = require('./src/utils/externalUserApi');
require('./src/logger/logger.js'); // Your custom logger

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // Configure for production
    methods: ["GET", "POST"]
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbInstance = new MongoDB();

// Middleware to extract JWT for REST APIs
const extractJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        req.jwtToken = authHeader.substring(7, authHeader.length);
    } else {
        req.jwtToken = null;
    }
    next();
};

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  const jwtToken = socket.handshake.auth.token;
  if (!jwtToken) {
    console.warn(`Socket ${socket.id} connected without JWT. Fetching user details will fail for socket events.`);
    // Optionally disconnect: socket.disconnect();
  }
  socket.jwtToken = jwtToken;

  socket.on('joinChat', (chatId) => {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      console.error(`Socket ${socket.id} tried to join invalid chatId: ${chatId}`);
      socket.emit('error', { message: 'Invalid chatId provided for joinChat.' });
      return;
    }
    socket.join(chatId);
    console.log(`Socket ${socket.id} joined chat room: ${chatId}`);
  });

  socket.on('leaveChat', (chatId) => {
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
      console.error(`Socket ${socket.id} tried to leave invalid chatId: ${chatId}`);
      return;
    }
    socket.leave(chatId);
    console.log(`Socket ${socket.id} left chat room: ${chatId}`);
  });

  socket.on('sendMessage', async (data) => {
    const { chatId, senderExternalId, message } = data;
    const token = socket.jwtToken;

    console.log(`sendMessage event from ${socket.id}:`, { chatId, senderExternalId, message: '...' });

    if (!token) {
        socket.emit('messageError', { error: 'Authentication token not found. Cannot send message.' });
        return;
    }
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId) || !senderExternalId || !message) {
      console.error('Invalid data for sendMessage:', { chatId, senderExternalId, message: '...' });
      socket.emit('messageError', { error: 'Missing chatId, senderExternalId, or message content.' });
      return;
    }

    try {
      const userDetails = await fetchUserDetails(senderExternalId, token);
      const senderUsername = userDetails ? userDetails.name : `User ${senderExternalId.substring(0,4)}`;

      const result = await dbInstance.post_message(chatId, senderExternalId, senderUsername, message);

      if (result.success && result.data) {
        io.to(chatId).emit('newMessage', result.data);
        console.log(`Message broadcast to room ${chatId}:`, { ...result.data, message: '...' });
      } else {
        console.error('Failed to save message to DB:', result.error);
        socket.emit('messageError', { error: 'Failed to send message. Could not save to database.' });
      }
    } catch (error) {
      console.error('Error processing sendMessage:', error);
      socket.emit('messageError', { error: 'Server error while sending message.' });
    }
  });

  socket.on('typing', async (data) => {
    const { chatId, isTyping, externalUserId } = data;
    const token = socket.jwtToken;

    if (chatId && externalUserId && token) {
        const userDetails = await fetchUserDetails(externalUserId, token);
        const username = userDetails ? userDetails.name : `User ${externalUserId.substring(0,4)}`;
        socket.to(chatId).emit('userTyping', { username, isTyping, chatId });
    } else if (chatId && data.username) { // Fallback if only username is sent
         socket.to(chatId).emit('userTyping', { username: data.username, isTyping, chatId });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// --- REST API Routes ---
const MC = new MessageController();
const CC = new ChatController();

app.get('/', (req, res) => {
  console.log('Request received at /');
  res.status(200).send('Welcome to the WebBackendNode Chat & Message API!');
});

app.post('/messages', extractJwt, async (req, res) => {
    console.log('POST /messages (HTTP)', req.body);
    const result = await MC.post_message_http(req.body, dbInstance, req.jwtToken);
    if (result[0] === 201 && result[1].data && result[1].data.chatId) {
        io.to(result[1].data.chatId.toString()).emit('newMessage', result[1].data);
    }
    res.status(result[0]).json(result[1]);
});

app.get('/chats/:chatId/messages', extractJwt, async (req, res) => {
    const { chatId } = req.params;
    console.log(`GET /chats/${chatId}/messages`, req.query);
    if (!req.jwtToken) {
        return res.status(401).json({ error: "Authorization header with Bearer token is required." });
    }
    const result = await MC.get_chat_messages(chatId, req.query, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

app.post('/chats', async (req, res) => {
    console.log('POST /chats', req.body);
    const result = await CC.create_chat(req.body, dbInstance);
    res.status(result[0]).json(result[1]);
});

app.get('/chats/user/:externalUserId', extractJwt, async (req, res) => {
    const { externalUserId } = req.params;
    console.log(`GET /chats/user/${externalUserId}`);
    if (!req.jwtToken) {
        return res.status(401).json({ error: "Authorization header with Bearer token is required." });
    }
    const result = await CC.get_chats_for_external_user(externalUserId, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

// --- 404 Handler ---
app.use((req, res, next) => {
    const log_message = `404 - Route Not Found: ${req.method} ${req.originalUrl}`;
    console.warn(log_message);
    res.status(404).json({ error: 'Route not found' });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error("Unhandled application error:", err.stack || err);
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
                    ? 'Internal Server Error'
                    : err.message || 'An unexpected error occurred.';
  res.status(statusCode).json({ error: message });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server with Socket.IO running at http://localhost:${PORT}/`);
});