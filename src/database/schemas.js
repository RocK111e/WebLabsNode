// src/database/schemas.js
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

// --- Chat Schema ---
const chatSchema = new mongoose.Schema({
    participantExternalIds: [{
        type: String,
        required: [true, 'External participant ID is required'],
        trim: true,
        validate: {
            validator: function(v) {
                return v && v.length > 0;
            },
            message: props => `${props.value} is not a valid external participant ID!`
        }
    }],
}, {
    timestamps: true
});
chatSchema.index({ participantExternalIds: 1 });
const ChatModel = mongoose.model('Chat', chatSchema);

// --- Exports ---
module.exports = {
  Message: MessageModel,
  Chat: ChatModel
};