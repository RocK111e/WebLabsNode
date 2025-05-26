// src/database/database.js
const mongoose = require('mongoose');
const { Message, Chat } = require('./schemas');

class MongoDB {
  constructor() {
    this.connectDB();
  }

  connectDB = async () => {
    if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) {
      try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/mydatabase");
        console.log('MongoDB connected');
      } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
      }
    } else if (mongoose.connection.readyState === 2) {
        console.log('MongoDB connection already in progress...');
    }
  };

  // --- Message Methods ---
  async post_message(chatId, senderExternalId, username, messageText) {
    try {
      const newMessage = await Message.create({
        chatId,
        senderExternalId,
        username, // This is the fetched username
        message: messageText
      });
      console.log('Message saved:', newMessage);
      return { success: true, data: newMessage };
    } catch (err) {
      console.error('Error saving message:', err.message);
      return { success: false, error: err.message };
    }
  }

  async get_messages_for_chat(chatId, limit = 50, skip = 0) {
    try {
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return { success: false, error: 'Invalid chatId format.', data: [] };
      }
      const messages = await Message.find({ chatId })
                                    .sort({ createdAt: -1 })
                                    .skip(skip)
                                    .limit(limit)
                                    .lean();
      return { success: true, data: messages.reverse() };
    } catch (err) {
      console.error('Error retrieving messages for chat:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }

  // --- Chat Methods ---
  async createChat(externalParticipantIds) {
    try {
      if (!Array.isArray(externalParticipantIds) || externalParticipantIds.length === 0) {
          return { success: false, error: 'Participant IDs must be a non-empty array.' };
      }
      const uniqueIds = [...new Set(externalParticipantIds)];
      if (uniqueIds.length !== externalParticipantIds.length) {
          return { success: false, error: 'Participant IDs must be unique within a chat.' };
      }
      const newChat = await Chat.create({ participantExternalIds: uniqueIds });
      console.log('Chat created:', newChat);
      return { success: true, data: newChat };
    } catch (err) {
      console.error('Error creating chat:', err.message);
      if (err.name === 'ValidationError') {
        return { success: false, error: err.message };
      }
      return { success: false, error: 'Server error creating chat.' };
    }
  }

  async getChatsByExternalParticipantId(externalUserId) {
    try {
      if (typeof externalUserId !== 'string' || externalUserId.trim() === '') {
        return { success: false, error: 'Invalid external User ID format.', data: [] };
      }
      const chats = await Chat.find({ participantExternalIds: externalUserId })
                              .sort({ updatedAt: -1 })
                              .lean();
      return { success: true, data: chats };
    } catch (err) {
      console.error('Error retrieving chats for external user ID:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }
}

module.exports = MongoDB;