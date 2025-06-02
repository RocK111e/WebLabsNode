const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        trim: true,
        minlength: [3, 'Username must be at least 3 characters long'],
        maxlength: [50, 'Username cannot exceed 50 characters']
    },
    message: {
        type: String,
        required: [true, 'Message is required'],
        trim: true,
        minlength: [1, 'Message cannot be empty'],
        maxlength: [500, 'Message cannot exceed 500 characters']
    },
    userId: {
        type: String,
        required: [true, 'User is required'],
        trim: true,
        minlength: [1, 'User must be at least 1 characters long'],
        maxlength: [50, 'User cannot exceed 50 characters']
    },
}, {
    timestamps: true
});

const chatSchema = new mongoose.Schema({
    chatName: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name cannot be empty'],
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    userIds: [{
        type: String,
        required: [true, 'User is required'],
        trim: true,
        minlength: [1, 'User must be at least 1 characters long'],
        maxlength: [50, 'User cannot exceed 50 characters']
    }],
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    }]
}, {
    timestamps: true
});

// Export the models
const Message = mongoose.model('Message', messageSchema);
const Chat = mongoose.model('Chat', chatSchema);

module.exports = { Message, Chat };