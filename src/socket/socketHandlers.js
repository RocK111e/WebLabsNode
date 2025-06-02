// src/socket/socketHandlers.js
const mongoose = require('mongoose');
const { fetchUserDetails } = require('../utils/externalUserApi');

function initializeSocketIO(io, dbInstance) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    const jwtTokenFromHandshake = socket.handshake.auth.token;
    const externalUserIdFromHandshake = socket.handshake.auth.externalUserId; // EXPECTING THIS FROM CLIENT

    if (!jwtTokenFromHandshake) {
      console.warn(`Socket ${socket.id} connected without JWT. Some features might be restricted.`);
    }
    socket.jwtToken = jwtTokenFromHandshake;

    if (externalUserIdFromHandshake) {
      socket.externalUserId = externalUserIdFromHandshake; // Store it on the socket
      const userSpecificRoom = `user_${externalUserIdFromHandshake}`;
      socket.join(userSpecificRoom);
      console.log(`Socket ${socket.id} for user ${externalUserIdFromHandshake} joined room ${userSpecificRoom}`);
    } else {
      console.warn(`Socket ${socket.id} connected without externalUserId. User-specific notifications will not work for this socket.`);
    }

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
      // Ensure senderExternalId from data matches the authenticated user on the socket
      if (socket.externalUserId && senderExternalId !== socket.externalUserId) {
        console.warn(`Socket ${socket.id} sendMessage: senderExternalId ${senderExternalId} in message data does not match authenticated user ${socket.externalUserId}.`);
        socket.emit('messageError', { chatId, error: 'Sender ID mismatch with authenticated user.' });
        return;
      }

      try {
        const userDetails = await fetchUserDetails(senderExternalId, tokenForPHP);
        const senderUsername = userDetails && userDetails.name ? userDetails.name : `User (${senderExternalId.substring(0,4)})`;
        
        const result = await dbInstance.post_message(chatId, senderExternalId, senderUsername, message.trim());
        
        if (result.success && result.data) {
          const savedMessage = result.data;
          io.to(chatId.toString()).emit('newMessage', savedMessage); // Broadcast to all in chat room
          console.log(`Message sent by ${socket.id} to room ${chatId}:`, savedMessage.message);

          // --- Notification Logic ---
          const chatDetails = await dbInstance.getChatById(chatId.toString());
          if (chatDetails.success && chatDetails.data) {
            const participants = chatDetails.data.participantExternalIds || [];
            const chatName = chatDetails.data.chatName || (participants.length === 2 ? `Chat with ${senderUsername}` : "Group Chat"); // Basic naming for 1-on-1
            
            participants.forEach(participantId => {
              if (participantId.toString() !== senderExternalId.toString()) { // Don't notify the sender
                const userSpecificRoom = `user_${participantId}`;
                const notificationData = {
                  chatId: chatId.toString(),
                  chatName: chatName,
                  senderExternalId: senderExternalId.toString(),
                  senderName: senderUsername,
                  messageSnippet: savedMessage.message.substring(0, 50) + (savedMessage.message.length > 50 ? '...' : ''),
                  timestamp: savedMessage.createdAt,
                  isGroupChat: chatDetails.data.isGroupChat,
                };
                io.to(userSpecificRoom).emit('newMessageNotification', notificationData);
                console.log(`Sent notification to ${userSpecificRoom} for message in chat ${chatId}`);
              }
            });
          } else {
            console.warn(`Could not fetch chat details for ${chatId} to send notifications. Error: ${chatDetails.error}`);
          }
          // --- End Notification Logic ---

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
      if (socket.externalUserId && externalUserId !== socket.externalUserId) {
        console.warn(`Socket ${socket.id} typing: externalUserId ${externalUserId} in typing data does not match authenticated user ${socket.externalUserId}. Ignoring.`);
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
          socket.to(chatId.toString()).emit('userTyping', { username: usernameToDisplay, isTyping, chatId: chatId.toString(), externalUserId });
      } catch (error) {
          console.error(`Socket ${socket.id} typing: Error fetching user details for ${externalUserId} in chat ${chatId}. Error: ${error.message}`);
          const fallbackUsername = `User (${externalUserId ? externalUserId.substring(0,4) : 'Unknown'})`;
          socket.to(chatId.toString()).emit('userTyping', { username: fallbackUsername, isTyping, chatId: chatId.toString(), externalUserId });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}. Reason: ${reason}`);
      if (socket.externalUserId) {
        const userSpecificRoom = `user_${socket.externalUserId}`;
        console.log(`Socket ${socket.id} for user ${socket.externalUserId} from room ${userSpecificRoom} disconnected.`);
      }
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}: ${error.message}`, error.stack);
    });
  });
}

module.exports = initializeSocketIO;