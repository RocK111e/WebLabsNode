// src/database/database.js (Node.js Backend)
const mongoose = require('mongoose');
const { Message, Chat } = require('./schemas'); // Ensure this path is correct

class MongoDB {
  constructor() {
    this.connectDB();
  }

  connectDB = async () => {
    if (mongoose.connection.readyState === 0 || mongoose.connection.readyState === 3) { // 0 = disconnected, 3 = disconnecting
      try {
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/mydatabase");
        console.log('MongoDB connected');
      } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); // Exit process with failure
      }
    } else if (mongoose.connection.readyState === 2) { // 2 = connecting
        console.log('MongoDB connection already in progress...');
    }
  };

  // --- Message Methods --- (No changes needed here for this schema update)
  async post_message(chatId, senderExternalId, username, messageText) {
    try {
      const newMessage = await Message.create({
        chatId,
        senderExternalId,
        username,
        message: messageText
      });
      // Optionally, update the Chat's lastMessage and updatedAt timestamp
      // await Chat.findByIdAndUpdate(chatId, { 
      //   'lastMessage.text': messageText.substring(0, 70), // snippet
      //   'lastMessage.senderUsername': username,
      //   'lastMessage.senderExternalId': senderExternalId,
      //   'lastMessage.timestamp': newMessage.createdAt,
      //   updatedAt: newMessage.createdAt // Explicitly set updatedAt for sorting chat list
      // });
      console.log('Message saved:', newMessage._id);
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
                                    .sort({ createdAt: -1 }) // Get newest first for pagination
                                    .skip(skip)
                                    .limit(limit)
                                    .lean();
      return { success: true, data: messages.reverse() }; // Reverse to show oldest first in the fetched batch
    } catch (err) {
      console.error('Error retrieving messages for chat:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }

  // --- Chat Methods (Updated createChat) ---
  async createChat(externalParticipantIds, chatName = null /* creatorExternalId no longer used directly here */) {
    try {
      if (!Array.isArray(externalParticipantIds) || externalParticipantIds.length === 0) {
          return { success: false, error: 'Participant IDs must be a non-empty array.' };
      }
      // Ensure IDs are unique and trimmed
      const uniqueIds = [...new Set(externalParticipantIds.map(id => String(id).trim()))];

      if (uniqueIds.length < 1) { // Should be at least 1 (e.g., notes to self if named) or 2 for a typical chat
           return { success: false, error: 'Chats require at least one participant.' };
      }
      // If it's a 1-on-1 chat (2 participants, no explicit name), prevent duplicates.
      // If a chatName is provided, it's treated as a distinct group, even with 2 people.
      if (uniqueIds.length === 2 && !chatName) {
          const sortedIds = [...uniqueIds].sort(); // Sort to ensure consistent query
          const existingChat = await Chat.findOne({
              // isGroupChat: false, // This field is removed
              participantExternalIds: { $all: sortedIds, $size: 2 },
              chatName: null // Explicitly look for unnamed 1-on-1
          });
          if (existingChat) {
              console.log('Found existing 1-on-1 chat:', existingChat._id);
              return { success: true, data: existingChat, existed: true };
          }
      }
      // If it's a named chat or involves more than 2 people (or just 1 for "notes to self")
      // and a chatName is provided, it's fine.
      // If it has 1 participant, it MUST have a chatName (e.g., "My Notes")
      if (uniqueIds.length === 1 && (!chatName || chatName.trim() === '')) {
          return { success: false, error: 'Single-participant chats (like "Notes to self") must have a name.' };
      }


      const chatData = {
          participantExternalIds: uniqueIds,
          chatName: chatName ? chatName.trim() : null,
          // No isGroupChat or adminExternalId anymore
      };

      const newChat = await Chat.create(chatData);
      console.log('Chat created:', newChat._id, 'Name:', newChat.chatName);
      return { success: true, data: newChat, existed: false };
    } catch (err) {
      console.error('Error creating chat:', err.message);
      if (err.name === 'ValidationError') {
        // Extract more specific validation errors if possible
        const errors = Object.values(err.errors).map(e => e.message).join(', ');
        return { success: false, error: `Validation failed: ${errors}` };
      }
      return { success: false, error: 'Server error while creating chat.' };
    }
  }

  async getChatsByExternalParticipantId(externalUserId) {
    try {
      if (typeof externalUserId !== 'string' || externalUserId.trim() === '') {
        return { success: false, error: 'Invalid external User ID format.', data: [] };
      }
      const userIdTrimmed = externalUserId.trim();
      const chats = await Chat.find({ participantExternalIds: userIdTrimmed })
                              // .populate('lastMessage.sender', 'username externalId avatarUrl') // If you add lastMessage with ref
                              .sort({ updatedAt: -1 }) // Show most recently active chats first
                              .lean();
      return { success: true, data: chats };
    } catch (err) {
      console.error('Error retrieving chats for external user ID:', err.message);
      return { success: false, error: err.message, data: [] };
    }
  }

  async getChatById(chatId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(chatId)) {
        return { success: false, error: 'Invalid chatId format.', data: null };
      }
      const chat = await Chat.findById(chatId).lean();
      if (!chat) {
        return { success: false, error: 'Chat not found.', data: null };
      }
      return { success: true, data: chat };
    } catch (err) {
      console.error(`Error retrieving chat by ID ${chatId}:`, err.message);
      return { success: false, error: `Server error retrieving chat: ${err.message}`, data: null };
    }
  }
}

module.exports = MongoDB;