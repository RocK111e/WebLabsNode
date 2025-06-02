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

   // src/socket/socketHandlers.js
// ... (imports and other parts)

    socket.on('sendMessage', async (data) => {
      const { chatId, senderExternalId, message } = data;
      // ... (initial checks as before) ...

      try {
        // ... (fetch sender userDetails, post_message as before) ...
        
        if (result.success && result.data) {
          const savedMessage = result.data;
          io.to(chatId.toString()).emit('newMessage', savedMessage);
          console.log(`Message sent by ${socket.id} to room ${chatId}:`, savedMessage.message);

          // --- Notification Logic ---
          const chatDetailsResult = await dbInstance.getChatById(chatId.toString()); // Fetch chat details
          if (chatDetailsResult.success && chatDetailsResult.data) {
            const chat = chatDetailsResult.data;
            const participants = chat.participantExternalIds || [];
            
            // Determine chatName for notification (could be more sophisticated for 1-on-1)
            let effectiveChatName = chat.chatName;
            if (!effectiveChatName && participants.length === 2) {
                // For 1-on-1, try to get the other user's name if senderUsername is available
                const otherParticipantId = participants.find(pId => pId.toString() !== senderExternalId.toString());
                if (otherParticipantId) {
                    // To get the other user's actual name for the notification, you might need
                    // to fetch their details IF you don't already have it from senderUsername context.
                    // This can get complex here quickly. For simplicity, we use senderUsername or generic.
                    effectiveChatName = `Chat with ${senderUsername}`; 
                } else {
                    effectiveChatName = "Direct Message";
                }
            } else if (!effectiveChatName) {
                effectiveChatName = "Group Chat";
            }

            // Determine if it's a group for notification purposes
            const isEffectivelyGroupForNotification = !!chat.chatName || participants.length > 2;
            
            participants.forEach(participantId => {
              if (participantId.toString() !== senderExternalId.toString()) {
                const userSpecificRoom = `user_${participantId}`;
                const notificationData = {
                  chatId: chatId.toString(),
                  chatName: effectiveChatName,
                  senderExternalId: senderExternalId.toString(),
                  senderName: senderUsername, // Username of the message sender
                  messageSnippet: savedMessage.message.substring(0, 50) + (savedMessage.message.length > 50 ? '...' : ''),
                  timestamp: savedMessage.createdAt,
                  isGroupChat: isEffectivelyGroupForNotification, // Based on derived logic
                  messageId: savedMessage._id.toString()
                };
                io.to(userSpecificRoom).emit('newMessageNotification', notificationData);
                console.log(`Sent notification to ${userSpecificRoom} for message in chat ${chatId}`);
              }
            });
          } else {
            console.warn(`Could not fetch chat details for ${chatId} to send notifications. Error: ${chatDetailsResult.error}`);
          }
          // --- End Notification Logic ---
        } else { /* ... error handling ... */ }
      } catch (error) { /* ... error handling ... */ }
    });

// ... (rest of socketHandlers.js)

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