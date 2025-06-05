const MongoDB = require('../database/database');

function setupSocketIO(io) {
    // Store active users
    const activeUsers = new Map(); // userId -> socket.id

    io.on('connection', (socket) => {
        console.log('New client connected');

        // Handle user joining with their ID
        socket.on('user_connect', (userId) => {
            console.log(`User ${userId} connected`);
            activeUsers.set(userId, socket.id);
            
            // Notify others that user is online
            socket.broadcast.emit('user_status', {
                userId: userId,
                status: 'online'
            });
        });

        // Handle chat message
        socket.on('send_message', async (data) => {
            const { chatId, message, username, userId } = data;
            
            try {
                const DB = new MongoDB();
                
                // Save message to database
                const newMessage = await DB.post_message(username, message, userId);
                
                if (newMessage) {
                    // Add message to chat
                    await DB.add_message_to_chat(chatId, newMessage._id);

                    // Get chat details to find all participants
                    const chat = await DB.get_user_chats(chatId);
                    
                    if (chat) {
                        // Emit message to all participants in the chat
                        chat.userIds.forEach((participantId) => {
                            const participantSocketId = activeUsers.get(participantId);
                            if (participantSocketId) {
                                io.to(participantSocketId).emit('new_message', {
                                    chatId,
                                    message: newMessage,
                                    sender: {
                                        userId,
                                        username
                                    }
                                });
                            }
                        });

                        // Send notification to offline users
                        chat.userIds.forEach((participantId) => {
                            if (!activeUsers.has(participantId) && participantId !== userId) {
                                // Here you could implement push notifications or store unread messages count
                                console.log(`User ${participantId} is offline, storing notification`);
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error handling message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle typing status
        socket.on('typing_status', (data) => {
            const { chatId, userId, username, isTyping } = data;
            socket.to(chatId).emit('user_typing', { userId, username, isTyping });
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('Client disconnected');
            // Find and remove disconnected user
            for (const [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    activeUsers.delete(userId);
                    // Notify others that user is offline
                    socket.broadcast.emit('user_status', {
                        userId: userId,
                        status: 'offline'
                    });
                    break;
                }
            }
        });
    });
}

module.exports = setupSocketIO;

