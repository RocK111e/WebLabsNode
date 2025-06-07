class ChatsController {
  constructor() {
    console.log("ChatsController created successfully!")
  }

  async getChats(query, DB, res) {
    const userId = query.UserId;
    console.log(`Fetching chats for user ID: ${userId}`);
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
    console.log(`Creating new chat "${chatName}" with users:`, userIds);

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
    console.log(`Fetching messages for chat ID: ${chatId}`);

    if (!chatId || chatId === "undefined") {
      console.error('Invalid chat ID received:', chatId);
      res.status(400).json({ error: 'Chat ID is required' });
      return;
    }

    try {
      const messages = await DB.get_chat_messages(chatId);
      res.status(200).json(messages);
    } catch (error) {
      console.error(`Error fetching messages for chat ${chatId}:`, error.message);
      res.status(500).json({ error: error.message || 'Failed to retrieve chat messages' });
    }
  }

  async addUsersToChat(req, DB, res) {
    const chatId = req.params.chatId;
    const { userIds } = req.body;

    if (!chatId || chatId === "undefined") {
      console.error('Invalid chat ID received:', chatId);
      res.status(400).json({ error: 'Chat ID is required' });
      return;
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.error('Invalid userIds received:', userIds);
      res.status(400).json({ error: 'User IDs array is required' });
      return;
    }

    console.log(`Adding users ${userIds} to chat ${chatId}`);

    try {
      const updatedChat = await DB.add_users_to_chat(chatId, userIds);
      if (updatedChat) {
        res.status(200).json(updatedChat);
      } else {
        res.status(404).json({ error: 'Chat not found' });
      }
    } catch (error) {
      console.error(`Error adding users to chat ${chatId}:`, error.message);
      res.status(500).json({ error: error.message || 'Failed to add users to chat' });
    }
  }
}

module.exports = ChatsController;