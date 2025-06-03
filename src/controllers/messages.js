class MessageController {
    constructor() {
        console.log("MessageController created successfully!")
    }

    async post_message(body, DB) {
        try {
            const username = body.Name;
            const message = body.Message;
            const userId = body.UserId;
            const chatId = body.ChatId;

            // Validate required fields
            if (!username || !message || !userId || !chatId) {
                return [400, "Missing required fields"];
            }

            // Create the message
            const newMessage = await DB.post_message(username, message, userId, chatId);
            if (!newMessage) {
                return [500, "Failed to create message"];
            }

            // Add message to the chat
            const updatedChat = await DB.add_message_to_chat(chatId, newMessage._id);
            if (!updatedChat) {
                return [404, "Chat not found or failed to add message to chat"];
            }

            return [201, "Message posted successfully", newMessage];
        } catch (error) {
            console.error("Error posting message:", error);
            return [500, "Internal server error"];
        }
    }
}

module.exports = MessageController;