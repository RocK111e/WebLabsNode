// src/database/schemas.js (Node.js Backend)
const mongoose = require('mongoose');

// --- Message Schema ---
const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat', // Should match the model name 'Chat'
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
    required: false, // Keep as false, might not always be available immediately
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
  timestamps: true // Adds createdAt and updatedAt
});
// Ensure index for faster querying of messages by chat and time
messageSchema.index({ chatId: 1, createdAt: -1 });

const MessageModel = mongoose.model('Message', messageSchema);

// --- Chat Schema (Simplified for "Only Group Chats" - though 1-on-1 is a group of 2) ---
const chatSchema = new mongoose.Schema({
    chatName: { // Custom name for the chat. Can be null for 1-on-1 if frontend derives name.
        type: String,
        trim: true,
        maxlength: 100,
        default: null
    },
    participantExternalIds: [{ // Array of external user IDs participating in the chat
        type: String,
        required: true,
        trim: true
    }],
    // lastMessage could be added here later for chat list previews
    // lastMessage: {
    //   text: String,
    //   senderUsername: String,
    //   senderExternalId: String,
    //   timestamp: Date
    // }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

// Index to efficiently find chats by participant(s)
chatSchema.index({ participantExternalIds: 1 });
// Optional: Index for searching chats by name if that's a feature
chatSchema.index({ chatName: 'text' });

// Pre-save hook to ensure participant IDs are sorted for 1-on-1 chat uniqueness check if needed,
// though with the new model, this might be less critical unless you strictly want to prevent
// duplicate 2-participant chats regardless of chatName.
// chatSchema.pre('save', function(next) {
//   if (this.participantExternalIds && this.participantExternalIds.length === 2 && !this.chatName) {
//     this.participantExternalIds.sort(); // Sort to ensure consistent order for uniqueness check
//   }
//   next();
// });


const ChatModel = mongoose.model('Chat', chatSchema);

// --- Exports ---
module.exports = {
  Message: MessageModel,
  Chat: ChatModel
};