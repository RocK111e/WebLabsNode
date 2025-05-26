// src/controllers/chats.js
const { fetchUserDetails } = require('../utils/externalUserApi');

class ChatController {
    constructor() {
        console.log("ChatController created successfully!");
    }

    async create_chat(body, DB) {
        console.log("Creating chat started");
        const { participantExternalIds } = body;

        if (!participantExternalIds || !Array.isArray(participantExternalIds) || participantExternalIds.length < 1) {
            return [400, { error: "participantExternalIds is required as a non-empty array of strings." }];
        }

        for (const id of participantExternalIds) {
            if (typeof id !== 'string' || id.trim() === '') {
                return [400, { error: `Invalid format for external participant ID: '${id}'. Must be a non-empty string.` }];
            }
        }
        
        const result = await DB.createChat(participantExternalIds.map(id => id.trim()));

        if (result.success) {
            return [201, { message: "Chat created successfully", chat: result.data }];
        } else {
             if (result.error && (result.error.includes('validation failed') || result.error.includes('Participant IDs must be unique'))) {
                 return [422, { error: "Failed to create chat due to validation errors.", details: result.error }];
            }
            return [500, { error: "Failed to create chat on the server.", details: result.error }];
        }
    }

    async get_chats_for_external_user(externalUserId, DB, jwtToken) {
        console.log(`Getting chats for external user ${externalUserId} started`);

        if (!externalUserId || typeof externalUserId !== 'string' || externalUserId.trim() === '') {
            return [400, { error: "Valid external User ID (string) parameter is required." }];
        }
        if (!jwtToken) {
            return [401, { error: "Authentication token is required to fetch chat details." }];
        }

        const result = await DB.getChatsByExternalParticipantId(externalUserId.trim());

        if (result.success && result.data) {
            const chatsWithParticipantNames = await Promise.all(
                result.data.map(async (chat) => {
                    const participants = await Promise.all(
                        chat.participantExternalIds.map(async (id) => {
                            const userDetails = await fetchUserDetails(id, jwtToken);
                            return {
                                externalId: id,
                                name: userDetails ? userDetails.name : `User ${id.substring(0,4)}`
                            };
                        })
                    );
                    // chat is from .lean(), create new object to add/modify properties
                    return { ...chat, participants, participantExternalIds: undefined }; // Remove original ID array if replaced
                })
            );
            return [200, chatsWithParticipantNames];
        } else {
            return [500, { error: "Error retrieving chats for external user.", details: result.error }];
        }
    }
}

module.exports = ChatController;