const express = require('express');
const MongoDB = require('./src/database/database');
const MessageContoller = require('./src/controllers/messages')
require('./src/logger/logger'); // Import logger to apply console overrides
const app = express();

app.get('/', (req, res) => {
  console.log('Request received at /');
  res.send('Welcome to the Home Page!AA');
});

app.get('/about', (req, res) => {
  console.log('Request received at /about');
  res.send('About Page');
});

app.post('/messages', (req, res) => {
    console.log('Request received at /messages');
    
    const DB = new MongoDB();
    const MC = new MessageContoller();
    const result = MC.post_message(req.body, DB);
    
    res.status(result[0]).send(result[1]);
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