// src/database/database.js (Node.js Backend)
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
        username,
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
                                    .lean(); // Use .lean() for performance if not modifying docs
      return { success: true, data: messages.reverse() }; // Show oldest first in batch
    } catch (err) {
      console.error('Error retrieving messages for chat:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }

  // --- Chat Methods (Updated for Group Chats) ---
  async createChat(externalParticipantIds, chatName = null, isGroup = false, creatorExternalId = null) {
    try {
      if (!Array.isArray(externalParticipantIds) || externalParticipantIds.length === 0) {
          return { success: false, error: 'Participant IDs must be a non-empty array.' };
      }
      // Ensure IDs are unique for the participants list. Frontend should ideally do this.
      const uniqueIds = [...new Set(externalParticipantIds.map(id => id.toString().trim()))];

      if (isGroup && (!chatName || chatName.trim() === '')) {
          return { success: false, error: 'Group chats must have a name.' };
      }
      if (isGroup && uniqueIds.length < 1) { // Group of 1 for "notes to self" is allowed if named
           return { success: false, error: 'Group chats require at least one participant.' };
      }
      if (!isGroup && uniqueIds.length !== 2) {
          return { success: false, error: 'One-on-one chats require exactly two distinct participants.' };
      }

      const chatData = {
          participantExternalIds: uniqueIds,
          isGroupChat: isGroup,
          chatName: (isGroup && chatName) ? chatName.trim() : null,
          adminExternalId: (isGroup && creatorExternalId) ? creatorExternalId.toString().trim() : null
      };

      // For 1-on-1 chats, check if a chat already exists between these two participants
      // to prevent duplicate 1-on-1 chat rooms.
      if (!isGroup && uniqueIds.length === 2) {
          const existingChat = await Chat.findOne({
              isGroupChat: false,
              participantExternalIds: { $all: uniqueIds, $size: 2 } // Order doesn't matter
          });
          if (existingChat) {
              console.log('Found existing 1-on-1 chat:', existingChat._id);
              return { success: true, data: existingChat, existed: true };
          }
      }

      const newChat = await Chat.create(chatData);
      console.log('Chat created:', newChat);
      return { success: true, data: newChat, existed: false };
    } catch (err) {
      console.error('Error creating chat:', err.message);
      if (err.name === 'ValidationError') {
        return { success: false, error: err.message };
      }
      return { success: false, error: 'Server error while creating chat.' };
    }
  }

  async getChatsByExternalParticipantId(externalUserId) {
    try {
      if (typeof externalUserId !== 'string' || externalUserId.trim() === '') {
        return { success: false, error: 'Invalid external User ID format.', data: [] };
      }
      const chats = await Chat.find({ participantExternalIds: externalUserId.trim() })
                              .sort({ updatedAt: -1 }) // Show most recently active chats first
                              .lean();
      return { success: true, data: chats };
    } catch (err) {
      console.error('Error retrieving chats for external user ID:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }
}

module.exports = MongoDB;