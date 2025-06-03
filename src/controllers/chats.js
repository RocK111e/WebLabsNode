class ChatsController {
  constructor() {
    console.log("ChatsController created successfully!")
  }

  async getChats(query, DB, res) {
    const userId = query.UserId;
    try {
      const chats = await DB.get_user_chats(userId);
      res.status(200).json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve chats' });
    }
  }

  async createChat(body, DB, res) {
    const userIds = body.UserIds;
    const chatName = body.chatName;
    console.log(`New chat data ${chatName} with ${userIds}`);

    try {
      const chat = await DB.create_chat(chatName, userIds);
      if (chat) {
        res.status(201).json(chat);
      } else {
        res.status(400).json({ error: 'Failed to create chat' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to create chat' });
    }
  }

  async getChatMessages(body, DB, res) {
    const chatId = body.chatId;

    try {
      const messages = await DB.get_chat_messages(chatId);
      res.status(200).json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to retrieve chat messages' });
    }
  }
}

module.exports = ChatsController;