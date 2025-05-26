// src/controllers/messages.js
const mongoose = require('mongoose');
const { fetchUserDetails } = require('../utils/externalUserApi');

class MessageController {
    constructor() {
        console.log("MessageController created successfully!");
    }

    async post_message_http(body, DB, jwtToken) {
        console.log("HTTP Posting message started");
        const { chatId, senderExternalId, message } = body;

        if (!chatId || !mongoose.Types.ObjectId.isValid(chatId)) {
            return [400, { error: "Valid chatId is required." }];
        }
        if (!senderExternalId || typeof senderExternalId !== 'string' || senderExternalId.trim().length === 0) {
            return [400, { error: "senderExternalId is required." }];
        }
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return [400, { error: "Message is required." }];
        }

        let senderUsername = `User ${senderExternalId.substring(0,4)}`; // Fallback username
        if (jwtToken) {
            const userDetails = await fetchUserDetails(senderExternalId, jwtToken);
            if (userDetails && userDetails.name) {
                senderUsername = userDetails.name;
            }
        }

        const result = await DB.post_message(chatId, senderExternalId.trim(), senderUsername, message.trim());

        if (result.success) {
            return [201, { message: "Message posted successfully via HTTP", data: result.data }];
        } else {
            return [500, { error: "Failed to post message via HTTP.", details: result.error }];
        }
    }

    async get_chat_messages(chatId, query, DB, jwtToken) {
        console.log(`Getting messages for chat ${chatId}`);
        const limit = parseInt(query.limit) || 50;
        const skip = parseInt(query.skip) || 0;

        if (!jwtToken) {
            return [401, { error: "Authentication token is required to fetch message details." }];
        }

        const result = await DB.get_messages_for_chat(chatId, limit, skip);

        if (result.success && result.data) {
            const messagesWithNames = await Promise.all(
                result.data.map(async (msg) => {
                    let senderName = msg.username; // Use stored username if available
                    // If you always want the freshest name, uncomment the fetchUserDetails call
                    // or if msg.username is not populated (e.g., older messages before this feature)
                    if (!senderName && msg.senderExternalId) {
                        const userDetails = await fetchUserDetails(msg.senderExternalId, jwtToken);
                        senderName = userDetails ? userDetails.name : `User ${msg.senderExternalId.substring(0,4)}`;
                    }
                    // msg is from .lean(), so we are modifying a plain object or need to create a new one.
                    // Here, we directly assign to the plain object.
                    return { ...msg, username: senderName };
                })
            );
            return [200, messagesWithNames];
        } else {
            if (result.error === 'Invalid chatId format.') {
                return [400, { error: result.error }];
            }
            return [500, { error: "Error retrieving chat messages.", details: result.error }];
        }
    }
}

module.exports = MessageController;