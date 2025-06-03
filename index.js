const express = require('express');
const cors = require('cors');
const MongoDB = require('./src/database/database');
const MessageController = require('./src/controllers/messages');
const ChatsController = require('./src/controllers/chats');
require('./src/logger/logger'); // Import logger to apply console overrides

const app = express();
app.use(express.json()); // Add middleware to parse JSON bodies

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
};

app.use(cors(corsOptions));

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
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});