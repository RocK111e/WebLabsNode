const mongoose = require('mongoose');

class MongoDB{
  constructor(){
    this.connectDB();  
  }
  connectDB = async () => {
    try {
      await mongoose.connect("mongodb://localhost:27017/mydatabase");
      console.log('MongoDB connected');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      process.exit(1);
    }
  };

  messageSchema = new mongoose.Schema({
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
    time: {
      type: Date,
      default: Date.now
    }
  }, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
  });

  async post_message(username, message) {
    try {
    // Create and save the message
    const newMessage = await Message.create({
      username,
      message
    });
    console.log('Message saved:', newMessage);
    return true
  } catch (err) {
    console.error('Error saving message:', err.message);
    return false
  }
  }

}


module.exports = MongoDB;