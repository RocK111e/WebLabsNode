// src/database/schemas.js (Node.js Backend)
const mongoose = require('mongoose');

// --- Message Schema ---
const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true,
    index: true
  },
  senderExternalId: {
    type: String,
    required: [true, 'Sender external ID is required'],
    trim: true
  },
  username: { // Display name of the sender, fetched from external API
    type: String,
    required: false,
    trim: true,
    maxlength: [100, 'Username cannot exceed 100 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    minlength: [1, 'Message cannot be empty'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});
const MessageModel = mongoose.model('Message', messageSchema);

// --- Chat Schema (Updated for Group Chats) ---
const chatSchema = new mongoose.Schema({
    chatName: { // Custom name for the chat, especially for groups
        type: String,
        trim: true,
        maxlength: 100,
        default: null // Null for 1-on-1 chats where name is derived by frontend/controller
    },
    isGroupChat: {
        type: Boolean,
        default: false
    },
    participantExternalIds: [{
        type: String,
        required: true,
        trim: true
    }],
    adminExternalId: { // Optional: ID of the user who created/administers the group
        type: String,
        trim: true,
        default: null
    },
    // lastMessage: { // Optional: For displaying last message in chat list preview
    //   text: String,
    //   senderUsername: String, // Fetched name of the sender of the last message
    //   timestamp: Date
    // }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

chatSchema.index({ participantExternalIds: 1 }); // Efficiently find chats by participant
chatSchema.index({ chatName: 'text' }); // For text search on chat names if needed later

const ChatModel = mongoose.model('Chat', chatSchema);

// --- Exports ---
module.exports = {
  Message: MessageModel,
  Chat: ChatModel
};