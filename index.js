// index.js (Node.js Main Server File)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose'); // Still needed for ObjectId checks in routes and graceful shutdown
const cors = require('cors');

const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatController = require('./src/controllers/chats');
// Note: fetchUserDetails is now primarily used by socketHandlers and controllers,
// but it's good to be aware of its existence here if direct use was ever needed.
// const { fetchUserDetails } = require('./src/utils/externalUserApi'); 
require('./src/logger/logger.js'); // Assuming this sets up a global logger

// Import new modules
const initializeSocketIO = require('./src/socket/socketHandlers');
const { extractJwt } = require('./src/middleware/authMiddleware');
const { routeNotFoundHandler, globalErrorHandler } = require('./src/middleware/errorHandlers');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- Global Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: '*',
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization,X-Requested-With",
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(extractJwt); // Apply JWT extraction globally

// --- Database Initialization ---
const dbInstance = new MongoDB(); // Connects to DB via its constructor

// --- Socket.IO Initialization ---
initializeSocketIO(io, dbInstance); // Pass io instance and dbInstance

// --- REST API Routes ---
const MC = new MessageController();
const CC = new ChatController();

app.get('/', (req, res) => res.status(200).send('Chat API Welcome!'));

app.post('/messages', async (req, res) => {
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for posting message." });
    
    const result = await MC.post_message_http(req.body, dbInstance, req.jwtToken);
    
    if (result[0] === 201 && result[1] && result[1].success && result[1].data) {
        const savedMessage = result[1].data;
        const chatIdStr = savedMessage.chatId ? savedMessage.chatId.toString() : null;

        if (chatIdStr) {
            io.to(chatIdStr).emit('newMessage', savedMessage);
            console.log(`Message from HTTP POST (user: ${savedMessage.senderExternalId}) broadcasted to room ${chatIdStr}`);
        } else {
            console.warn("Message saved via HTTP POST, but chatId was missing in the response data. Cannot broadcast via socket.");
        }
    } else if (result[1] && result[1].error) {
        console.warn(`Attempt to post message via HTTP by ${req.body.senderExternalId} failed. Controller status ${result[0]}, Error: ${result[1].error || (result[1].details ? JSON.stringify(result[1].details) : 'Unknown error')}`);
    }
    res.status(result[0]).json(result[1]);
});

app.get('/chats/:chatId/messages', async (req, res) => {
    const { chatId } = req.params;
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for fetching messages." });
    if (!mongoose.Types.ObjectId.isValid(chatId)) return res.status(400).json({ error: "Invalid chatId." });
    
    const result = await MC.get_chat_messages(chatId, req.query, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

app.post('/chats', async (req, res) => {
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for creating chat." });
    
    const bodyWithToken = { ...req.body, jwtToken_passed_from_client_for_this_call_if_needed: req.jwtToken };
    const result = await CC.create_chat(bodyWithToken, dbInstance);
    res.status(result[0]).json(result[1]);
});

app.get('/chats/user/:externalUserId', async (req, res) => {
    const { externalUserId } = req.params;
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for fetching user chats." });
    
    const result = await CC.get_chats_for_external_user(externalUserId, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

// --- Error Handling Middleware ---
app.use(routeNotFoundHandler); // Handles 404s for undefined routes
app.use(globalErrorHandler); // Handles all other errors

// --- Server Start ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// --- Graceful Shutdown ---
process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  
  io.close(() => {
    console.log('Socket.IO server closed.');
  });

  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  } catch (err) {
    console.error('Error disconnecting MongoDB:', err);
  }

  server.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
      process.exit(1);
    }
    console.log('HTTP server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});