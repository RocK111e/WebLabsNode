const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatsController = require('./src/controllers/chats');
const setupSocketIO = require('./src/sockets/sockets');
require('./src/logger/logger'); // Import logger to apply console overrides

const app = express();
app.use(express.json()); // Add middleware to parse JSON bodies

const corsOptions = {
  origin: [
    "http://webnode.local:3000",
    "http://webnode.local",
    "http://weblabs.local:3000",
    "http://weblabs.local",
    "http://localhost:3000"
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));

// Create HTTP server and Socket.IO instance
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      "http://webnode.local",
      "http://weblabs.local",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false
});

// Debug Socket.IO connection issues
io.engine.on("connection_error", (err) => {
  console.log("Connection error:");
  console.log(err.req);      // the request object
  console.log(err.code);     // the error code, for example 1
  console.log(err.message);  // the error message, for example "Session ID unknown"
  console.log(err.context);  // some additional error context
});

// Setup Socket.IO handlers
setupSocketIO(io);

app.get('/', (req, res) => {
  console.log('Request received at /');
  res.send('Welcome to the Home Page!AA');
});

app.get('/about', (req, res) => {
  console.log('Request received at /about');
  res.send('About Page');
});

app.post('/messages', async (req, res) => {
    console.log('Request received at /messages');
    
    const DB = new MongoDB();
    const MC = new MessageController();
    const result = await MC.post_message(req.body, DB);
    
    res.status(result[0]).send(result[1]);
});

// Get list of chats for user
app.get('/chats', async (req, res) => {
    console.log('Request received at /chats');
    
    const DB = new MongoDB();
    const CC = new ChatsController();
    await CC.getChats(req.query, DB, res);
});

// Get messages for specific chat
app.get('/chats/:chatId/messages', async (req, res) => {
    console.log('Request received at /chats/:chatId/messages');
    
    const DB = new MongoDB();
    const CC = new ChatsController();
    const body = { chatId: req.params.chatId };
    await CC.getChatMessages(body, DB, res);
});

// Create new chat
app.post('/chats', async (req, res) => {
    console.log('Request received at /chats');
    
    const DB = new MongoDB();
    const CC = new ChatsController();
    await CC.createChat(req.body, DB, res);
});

app.use((req, res, next) => {
    const log_message =`Uncaught Request: ${req.method} ${req.originalUrl}` 
    console.log(log_message)
    res.status(404).send('Route not found');
});

const PORT = 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('Allowed origins:', corsOptions.origin);
});