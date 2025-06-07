const mongoose = require('mongoose');
const { Message, Chat } = require('./schemas'); // Fixed import path

class MongoDB {
  constructor() {
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

  // Get chat by ID
  async get_chat_by_id(chatId) {
    try {
      const chat = await Chat.findById(chatId);
      if (!chat) {
        console.error('Chat not found');
        return null;
      }
      console.log('Retrieved chat:', chat);
      return chat;
    } catch (err) {
      console.error('Error retrieving chat:', err.message);
      return null;
    }
  }

  // Create and save a new message
  async post_message(username, message, userId) {
    try {
      const newMessage = await Message.create({
        username,
        message,
        userId
      });
      console.log('Message saved:', newMessage);
      return newMessage;
    } catch (err) {
      console.error('Error saving message:', err.message);
      return null;
    }
  }

  // Create a new chat
  async create_chat(chatName, userIds) {
    try {
      const newChat = await Chat.create({
        chatName,
        userIds: userIds,
        messages: []
      });
      console.log('Chat created:', newChat);
      return newChat;
    } catch (err) {
      console.error('Error creating chat:', err.message);
      return null;
    }
  }

  // Add a message to a chat
  async add_message_to_chat(chatId, messageId) {
    try {
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        { $push: { messages: messageId } },
        { new: true }
      );
      if (!chat) {
        console.error('Chat not found');
        return null;
      }
      console.log('Message added to chat:', chat);
      return chat;
    } catch (err) {
      console.error('Error adding message to chat:', err.message);
      return null;
    }
  }

  // Get all messages in a chat
  async get_chat_messages(chatId) {
    try {
      const chat = await Chat.findById(chatId).populate('messages');
      if (!chat) {
        console.error('Chat not found');
        return null;
      }
      console.log('Retrieved chat messages:', chat.messages);
      return chat.messages;
    } catch (err) {
      console.error('Error retrieving chat messages:', err.message);
      return null;
    }
  }

  // Get all chats for a user
  async get_user_chats(userId) {
    try {
      const chats = await Chat.find({ userIds: userId });
      console.log('Retrieved user chats:', chats);
      return chats;
    } catch (err) {
      console.error('Error retrieving user chats:', err.message);
      return null;
    }
  }

  // Update chat name
  async update_chat_name(chatId, newChatName) {
    try {
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        { chatName: newChatName },
        { new: true }
      );
      if (!chat) {
        console.error('Chat not found');
        return null;
      }
      console.log('Chat name updated:', chat);
      return chat;
    } catch (err) {
      console.error('Error updating chat name:', err.message);
      return null;
    }
  }

  // Add user to chat
  async add_user_to_chat(chatId, userId) {
    try {
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        { $addToSet: { userIds: userId } }, // $addToSet prevents duplicates
        { new: true }
      );
      if (!chat) {
        console.error('Chat not found');
        return null;
      }
      console.log('User added to chat:', chat);
      return chat;
    } catch (err) {
      console.error('Error adding user to chat:', err.message);
      return null;
    }
  }
}

module.exports = MongoDB;