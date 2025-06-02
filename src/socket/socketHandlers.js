// src/socket/socketHandlers.js
const mongoose = require('mongoose'); // For mongoose.Types.ObjectId.isValid
const { fetchUserDetails } = require('../utils/externalUserApi'); // Used by socket handlers

function initializeSocketIO(io, dbInstance) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    const jwtTokenFromHandshake = socket.handshake.auth.token;
    if (!jwtTokenFromHandshake) {
      console.warn(`Socket ${socket.id} connected without JWT. Some features might be restricted.`);
    }
    socket.jwtToken = jwtTokenFromHandshake; // Store token for use in event handlers

    socket.on('joinChat', (chatId) => {
      if (chatId && typeof chatId === 'string' && mongoose.Types.ObjectId.isValid(chatId)) {
        console.log(`Socket ${socket.id} joining chat room: ${chatId}`);
        socket.join(chatId);
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
          return; 
      }
      if (typeof externalUserId !== 'string' || externalUserId.trim() === '') {
          console.warn(`Socket ${socket.id} typing: Invalid or missing externalUserId for chat ${chatId}.`);
          return;
      }

      if (!tokenForPHP && externalUserId) { 
          console.warn(`Socket ${socket.id} typing: Missing JWT for user ${externalUserId} in chat ${chatId}. User details might be incomplete.`);
      }

      try {
          let usernameToDisplay = `User (${externalUserId ? externalUserId.substring(0,4) : 'Unknown'})`;
          if (externalUserId && tokenForPHP) { 
              const userDetails = await fetchUserDetails(externalUserId, tokenForPHP); 
              if (userDetails && userDetails.name) {
                  usernameToDisplay = userDetails.name;
              }
          } else if (data.username) { 
              usernameToDisplay = data.username;
          }
          socket.to(chatId).emit('userTyping', { username: usernameToDisplay, isTyping, chatId, externalUserId });
      } catch (error) {
          console.error(`Socket ${socket.id} typing: Error fetching user details for ${externalUserId} in chat ${chatId}. Error: ${error.message}`);
          const fallbackUsername = `User (${externalUserId ? externalUserId.substring(0,4) : 'Unknown'})`;
          socket.to(chatId).emit('userTyping', { username: fallbackUsername, isTyping, chatId, externalUserId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}. Reason: ${reason}`);
      // Add any cleanup logic here if needed
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}: ${error.message}`, error.stack);
    });
  });
}

module.exports = initializeSocketIO;