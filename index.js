// index.js (Node.js Main Server File)
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');

const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatController = require('./src/controllers/chats');
// fetchUserDetails is used by controllers and socket handlers, not directly here usually
// const { fetchUserDetails } = require('./src/utils/externalUserApi');
require('./src/logger/logger.js');

const initializeSocketIO = require('./src/socket/socketHandlers');
const { extractJwt } = require('./src/middleware/authMiddleware');
const { routeNotFoundHandler, globalErrorHandler } = require('./src/middleware/errorHandlers');

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
app.use(extractJwt);

const dbInstance = new MongoDB();
initializeSocketIO(io, dbInstance);

const MC = new MessageController();
const CC = new ChatController();

app.get('/', (req, res) => res.status(200).send('Chat API Welcome!'));

app.post('/messages', async (req, res) => {
    if (!req.jwtToken) return res.status(401).json({ error: "Token required for posting message." });
    
    // Optional: Add server-side validation that req.body.senderExternalId matches an ID derived from req.jwtToken
    // This depends on how your JWTs are structured and if they contain the user's external ID.
    // For example:
    // const decodedToken = yourJwtDecodingFunction(req.jwtToken);
    // if (decodedToken && decodedToken.externalId !== req.body.senderExternalId) {
    //    return res.status(403).json({ error: "Sender ID does not match authenticated user." });
    // }

    const result = await MC.post_message_http(req.body, dbInstance, req.jwtToken);
    
    if (result[0] === 201 && result[1] && result[1].success && result[1].data) {
        const savedMessage = result[1].data;
        const chatIdStr = savedMessage.chatId ? savedMessage.chatId.toString() : null;
        const senderExternalId = savedMessage.senderExternalId;

        if (chatIdStr) {
            io.to(chatIdStr).emit('newMessage', savedMessage);
            console.log(`Message from HTTP POST (user: ${senderExternalId}) broadcasted to room ${chatIdStr}`);

            // --- Notification Logic for HTTP POST ---
            try {
                const chatDetails = await dbInstance.getChatById(chatIdStr);
                if (chatDetails.success && chatDetails.data) {
                    const participants = chatDetails.data.participantExternalIds || [];
                    const senderUsername = savedMessage.username || `User (${senderExternalId.substring(0,4)})`; // Use username from saved message
                    const chatName = chatDetails.data.chatName || (participants.length === 2 ? `Chat with ${senderUsername}` : "Group Chat");

                    participants.forEach(participantId => {
                        if (participantId.toString() !== senderExternalId.toString()) {
                            const userSpecificRoom = `user_${participantId}`;
                            const notificationData = {
                                chatId: chatIdStr,
                                chatName: chatName,
                                senderExternalId: senderExternalId.toString(),
                                senderName: senderUsername,
                                messageSnippet: savedMessage.message.substring(0, 50) + (savedMessage.message.length > 50 ? '...' : ''),
                                timestamp: savedMessage.createdAt,
                                isGroupChat: chatDetails.data.isGroupChat,
                            };
                            io.to(userSpecificRoom).emit('newMessageNotification', notificationData);
                            console.log(`Sent notification via HTTP route to ${userSpecificRoom} for message in chat ${chatIdStr}`);
                        }
                    });
                } else {
                    console.warn(`Could not fetch chat details for ${chatIdStr} (from HTTP POST) to send notifications. Error: ${chatDetails.error}`);
                }
            } catch (notificationError) {
                 console.error(`Error sending notifications from HTTP POST for chat ${chatIdStr}:`, notificationError);
            }
            // --- End Notification Logic ---
        } else {
            console.warn("Message saved via HTTP POST, but chatId was missing in the response data. Cannot broadcast or notify via socket.");
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
    
    // Optional: Add validation that externalUserId matches the ID in req.jwtToken if this is a protected route
    // for a user to only fetch *their own* chats.
    // const decodedToken = yourJwtDecodingFunction(req.jwtToken);
    // if (decodedToken && decodedToken.externalId !== externalUserId) {
    //    return res.status(403).json({ error: "Forbidden to access chats for another user." });
    // }

    const result = await CC.get_chats_for_external_user(externalUserId, dbInstance, req.jwtToken);
    res.status(result[0]).json(result[1]);
});

app.use(routeNotFoundHandler);
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

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