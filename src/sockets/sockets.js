const MongoDB = require('../database/database');

function setupSocketIO(io) {
    // Store active users
    const activeUsers = new Map(); // userId -> socket.id

    io.on('connection', (socket) => {
        console.log('New client connected');

        // Handle user joining with their ID
        socket.on('user_connect', (userId) => {
            console.log(`User connected - ID: ${JSON.stringify(userId)}`);
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
            console.log(`New message in chat ${chatId} from user ${username} (${userId}): ${message}`);
            
            try {
                const DB = new MongoDB();
                
                // Save message to database
                const newMessage = await DB.post_message(username, message, userId);
                
                if (newMessage) {
                    // Add message to chat
                    const updatedChat = await DB.add_message_to_chat(chatId, newMessage._id);

                    if (updatedChat && updatedChat.userIds) {
                        // Emit message to all participants in the chat
                        updatedChat.userIds.forEach((participantId) => {
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

                            // Send notification to offline users
                            if (!activeUsers.has(participantId) && participantId !== userId) {
                                console.log(`User ${participantId} is offline, storing notification`);
                            }
                        });
                    } else {
                        console.error(`Chat not found or has no users: ${chatId}`);
                        socket.emit('error', { message: 'Chat not found' });
                    }
                }
            } catch (error) {
                console.error('Error handling message:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('Client disconnected');
            // Find and remove disconnected user
            for (const [userId, socketId] of activeUsers.entries()) {
                if (socketId === socket.id) {
                    console.log(`User disconnected - ID: ${userId}`);
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

