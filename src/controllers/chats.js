class ChatsController {
  constructor() {
    console.log("ChatsController created successfully!")
  }

  async getChats(body, DB) {
    const userId = body.UserId;
    const user_name = body.Name;
    try {
      const chats = await DB.get_user_chats(userId);
      res.status(200).json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve chats' });
    }
  }

  async createChat(body, DB) {
    const userIds = body.UserIds;
    const chatName = body.chatName;

    try {
      const chat = await DB.create_chat(chatName, userIds);
      res.status(201).json(chat);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to create chat' });
    }
  }

  async getChatMessages(body, DB) {
    const chatId = body.chatId;

    try {

      const messages = await DB.get_chat_messages(chatId);

      res.status(200).json(messages);
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to retrieve chat messages' });
    }
  }
}