const MongoDB = require('../database/database');

function setupSocketIO(io) {
    io.on('connection', (socket) => {
        console.log('New client connected');

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
                        // Broadcast message to all clients in the chat
                        io.emit('new_message', {
                            chatId,
                            message: newMessage,
                            sender: {
                                userId,
                                username
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

        socket.on('disconnect', () => {
            console.log('Client disconnected');
        });
    });
}

module.exports = setupSocketIO;

