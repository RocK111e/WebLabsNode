// index.js (Node.js Main Server File)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');

const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatController = require('./src/controllers/chats');
const { fetchUserDetails } = require('./src/utils/externalUserApi'); // Used by controllers & socket handlers
require('./src/logger/logger.js'); // Assuming this sets up a global logger or console overrides

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: '*',
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization,X-Requested-With",
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

const dbInstance = new MongoDB();

const extractJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        req.jwtToken = authHeader.substring(7);
    } else {
        req.jwtToken = null;
    }
    next();
};
app.use(extractJwt); // Apply JWT extraction globally

// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  const jwtTokenFromHandshake = socket.handshake.auth.token;
  if (!jwtTokenFromHandshake) {
    console.warn(`Socket ${socket.id} connected without JWT. Some features might be restricted.`);
    // Optionally, disconnect if JWT is strictly required for all socket communication:
    // socket.disconnect(true);
    // return;
  }
  socket.jwtToken = jwtTokenFromHandshake; // Store token for use in event handlers

  socket.on('joinChat', (chatId) => {
    if (chatId && typeof chatId === 'string' && mongoose.Types.ObjectId.isValid(chatId)) {
      console.log(`Socket ${socket.id} joining chat room: ${chatId}`);
      socket.join(chatId);
      // Optionally confirm to the client
      socket.emit('chatJoined', { chatId, message: `Successfully joined chat ${chatId}` });
    } else {
      console.warn(`Socket ${socket.id} failed to join chat. Invalid or missing chatId: ${chatId}`);
      socket.emit('chatJoinError', { chatId, error: 'Invalid or missing chatId for joinChat.' });
    }
  });

  socket.on('leaveChat', (chatId) => {
    if (chatId && typeof chatId === 'string' && mongoose.Types.ObjectId.isValid(chatId)) {
      console.log(`Socket ${socket.id} leaving chat room: ${chatId}`);
      socket.leave(chatId);
      // Optionally confirm to the client
      socket.emit('chatLeft', { chatId, message: `Successfully left chat ${chatId}` });
    } else {
      console.warn(`Socket ${socket.id} failed to leave chat. Invalid or missing chatId: ${chatId}`);
      socket.emit('chatLeaveError', { chatId, error: 'Invalid or missing chatId for leaveChat.' });
    }
  });

  socket.on('sendMessage', async (data) => {
    const { chatId, senderExternalId, message } = data;
    const tokenForPHP = socket.jwtToken;

    if (!tokenForPHP) {
        console.warn(`Socket ${socket.id} sendMessage: Missing JWT for user ${senderExternalId}.`);
        socket.emit('messageError', { chatId, error: 'Authentication token missing. Cannot send message.' });
        return;
    }
    if (!chatId || !mongoose.Types.ObjectId.isValid(chatId) || !senderExternalId || !message || typeof message !== 'string' || message.trim() === '') {
        console.warn(`Socket ${socket.id} sendMessage: Invalid data. ChatID: ${chatId}, Sender: ${senderExternalId}, Msg provided: ${!!message}`);
        socket.emit('messageError', { chatId, error: 'Invalid message data. All fields (chatId, senderExternalId, message) are required and message cannot be empty.' });
        return;
    }

    try {
      const userDetails = await fetchUserDetails(senderExternalId, tokenForPHP);
      const senderUsername = userDetails && userDetails.name ? userDetails.name : `User (${senderExternalId.substring(0,4)})`;
      
      const result = await dbInstance.post_message(chatId, senderExternalId, senderUsername, message.trim());
      
      if (result.success && result.data) {
        io.to(chatId).emit('newMessage', result.data); // Broadcast to all in room, including sender
        console.log(`Message sent by ${socket.id} to room ${chatId}:`, result.data.message);
      } else {
        console.error(`Socket ${socket.id} sendMessage: Failed to save message for chat ${chatId}. Error: ${result.error}`);
        socket.emit('messageError', { chatId, error: result.error || 'Failed to save message.' });
      }
    } catch (error) {
      console.error(`Socket ${socket.id} sendMessage: Server error for chat ${chatId}. Error: ${error.message}`, error.stack);
      socket.emit('messageError', { chatId, error: 'Server error sending message.' });
    }
  });

  socket.on('typing', async (data) => {
    const { chatId, isTyping, externalUserId } = data;
    const tokenForPHP = socket.jwtToken;

    if (!chatId || typeof chatId !== 'string' || !mongoose.Types.ObjectId.isValid(chatId)) {
        console.warn(`Socket ${socket.id} typing: Invalid or missing chatId ${chatId}.`);
        return; // Don't emit error to client for this, just log and ignore
    }
    if (typeof externalUserId !== 'string' || externalUserId.trim() === '') {
        console.warn(`Socket ${socket.id} typing: Invalid or missing externalUserId for chat ${chatId}.`);
        return;
    }

    if (!tokenForPHP && externalUserId) { // Check externalUserId to avoid warning if it's not provided (old client maybe)
        console.warn(`Socket ${socket.id} typing: Missing JWT for user ${externalUserId} in chat ${chatId}. User details might be incomplete.`);
    }

    try {
        let usernameToDisplay = `User (${externalUserId ? externalUserId.substring(0,4) : 'Unknown'})`;
        if (externalUserId && tokenForPHP) { // Only fetch if we have an ID and token
            const userDetails = await fetchUserDetails(externalUserId, tokenForPHP); // Pass token
            if (userDetails && userDetails.name) {
                usernameToDisplay = userDetails.name;
            }
        } else if (data.username) { // Fallback for older clients or if externalUserId isn't sent
            usernameToDisplay = data.username;
        }
        // Emit to other clients in the room (socket.to(chatId) excludes the sender)
        socket.to(chatId).emit('userTyping', { username: usernameToDisplay, isTyping, chatId, externalUserId });
    } catch (error) {
        console.error(`Socket ${socket.id} typing: Error fetching user details for ${externalUserId} in chat ${chatId}. Error: ${error.message}`);
        // Fallback: emit with a generic name if user details fetch fails
        const fallbackUsername = `User (${externalUserId ? externalUserId.substring(0,4) : 'Unknown'})`;
        socket.to(chatId).emit('userTyping', { username: fallbackUsername, isTyping, chatId, externalUserId });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id}. Reason: ${reason}`);
    // Add any cleanup logic here, e.g., notify rooms the user has left, or clear typing status.
    // Example:
    // const externalUserId = socket.externalUserId; // If you stored this on socket connect
    // if (externalUserId) {
    //   socket.rooms.forEach(room => {
    //     if (room !== socket.id) { // Don't emit to the socket's own room ID
    //       // You might need to fetch username again or have it stored
    //       socket.to(room).emit('userTyping', { username: `User (${externalUserId.substring(0,4)})`, isTyping: false, chatId: room, externalUserId });
    //     }
    //   });
    // }
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}: ${error.message}`, error.stack);
    // Inform client about non-fatal errors if appropriate
    // socket.emit('socketOperationError', { message: 'A socket communication error occurred.' });
  });
});

// --- REST API Routes ---
const MC = new MessageController();
const CC = new ChatController();

app.get('/', (req, res) => res.status(200).send('Chat API Welcome!'));

app.post('/messages', async (req, res) => { // extractJwt middleware already applied
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for posting message." });
    
    const result = await MC.post_message_http(req.body, dbInstance, req.jwtToken); // result is [statusCode, responseBody]
    
    if (result[0] === 201 && result[1] && result[1].success && result[1].data) {
        const savedMessage = result[1].data;
        const chatIdStr = savedMessage.chatId ? savedMessage.chatId.toString() : null;

        if (chatIdStr) {
            io.to(chatIdStr).emit('newMessage', savedMessage);
            console.log(`Message from HTTP POST (user: ${savedMessage.senderExternalId}) broadcasted to room ${chatIdStr}`);
        } else {
            console.warn("Message saved via HTTP POST, but chatId was missing in the response data. Cannot broadcast via socket.");
        }
    } else if (result[1] && result[1].error) { // Log if there was an error reported by the controller
        console.warn(`Attempt to post message via HTTP by ${req.body.senderExternalId} failed. Controller status ${result[0]}, Error: ${result[1].error || (result[1].details ? JSON.stringify(result[1].details) : 'Unknown error')}`);
    }
    res.status(result[0]).json(result[1]);
});

app.get('/chats/:chatId/messages', async (req, res) => { // extractJwt
    const { chatId } = req.params;
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for fetching messages." });
    if (!mongoose.Types.ObjectId.isValid(chatId)) return res.status(400).json({ error: "Invalid chatId." });
    
    const result = await MC.get_chat_messages(chatId, req.query, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

app.post('/chats', async (req, res) => { // extractJwt
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for creating chat." });
    
    const bodyWithToken = { ...req.body, jwtToken_passed_from_client_for_this_call_if_needed: req.jwtToken };
    const result = await CC.create_chat(bodyWithToken, dbInstance);
    res.status(result[0]).json(result[1]);
});

app.get('/chats/user/:externalUserId', async (req, res) => { // extractJwt
    const { externalUserId } = req.params;
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for fetching user chats." });
    
    const result = await CC.get_chats_for_external_user(externalUserId, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

app.use((req, res, next) => res.status(404).json({ error: 'Route not found.' }));

app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.message, err.stack);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal Server Error.' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  
  // Close Socket.IO server first to stop accepting new connections
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
      process.exit(1); // Exit with error if server doesn't close
    }
    console.log('HTTP server closed.');
    process.exit(0); // Exit cleanly
  });

  // Force close if not shut down after a timeout
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000); // 10 seconds timeout
});