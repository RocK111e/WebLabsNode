class ChatsController {
  constructor() {
    console.log("ChatsController created successfully!")
  }

  async getChats(body, DB) {
    userId = body.userId;
    try {
      const chats = await DB.get_user_chats();
      res.status(200).json(chats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve chats' });
    }
  }

  async createChat(req, res) {
    try {
      const chat = await this.chatsService.createChat(req.body);
      res.status(201).json(chat);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create chat' });
    }
  }
}