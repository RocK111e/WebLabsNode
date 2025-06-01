// src/controllers/chats.js (Node.js Backend)
const { fetchUserDetails } = require('../utils/externalUserApi');

class ChatController {
    constructor() {
        console.log("ChatController created successfully!");
    }

    async create_chat(body, DB) {
        console.log("Controller: Creating chat, body:", body);
        const { participantExternalIds, chatName, creatorExternalId } = body;

        if (!participantExternalIds || !Array.isArray(participantExternalIds) || participantExternalIds.length === 0) {
            return [400, { error: "participantExternalIds is required as a non-empty array." }];
        }

        // Determine if it's a group chat based on presence of chatName or more than 2 participants.
        // Frontend should ideally pass an isGroupChat flag if it wants to be explicit.
        // For now, infer: if chatName is provided, it's a group. If >2 participants, it's a group.
        // If 1 participant and chatName, it's a "notes to self" group.
        const isGroup = !!chatName || participantExternalIds.length > 2 || (participantExternalIds.length === 1 && !!chatName);

        if (isGroup && (!chatName || chatName.trim() === '')) {
            return [400, { error: "A name is required for group chats." }];
        }
        // For group chats, the creatorExternalId should be one of the participants.
        if (isGroup && !creatorExternalId) {
            return [400, { error: "Creator ID (creatorExternalId) is required for group chats." }];
        }
        if (isGroup && !participantExternalIds.includes(creatorExternalId)) {
             // return [400, { error: "Creator must be one of the participants in a group chat." }];
             // Or automatically add them:
             // if (!participantExternalIds.find(id => id.toString() === creatorExternalId.toString())) {
             //    participantExternalIds.push(creatorExternalId.toString());
             // }
        }
        if (!isGroup && participantExternalIds.length !== 2) {
            return [400, { error: "One-on-one chats require exactly two distinct participant IDs." }];
        }

        const result = await DB.createChat(
            participantExternalIds.map(id => id.toString().trim()),
            isGroup ? chatName.trim() : null,
            isGroup,
            isGroup ? creatorExternalId.toString().trim() : null
        );

        if (result.success) {
            const statusCode = result.existed ? 200 : 201;
            // Enrich the chat data with participant names before sending back
            let enrichedChat = result.data;
            if (result.data && result.data.participantExternalIds) {
                const participantsDetails = await Promise.all(
                    result.data.participantExternalIds.map(async (id) => {
                        const userDetails = await fetchUserDetails(id, body.jwtToken_passed_from_client_for_this_call_if_needed); // See note below
                        return { externalId: id, name: userDetails ? userDetails.name : `User ${id.slice(0,4)}` };
                    })
                );
                enrichedChat = { ...result.data.toObject(), participants: participantsDetails }; // toObject if it's a Mongoose doc
            }
            return [statusCode, { message: result.existed ? "Chat already exists" : "Chat created successfully", chat: enrichedChat }];
        } else {
             if (result.error && (result.error.includes('validation failed') || result.error.includes('must have a name'))) {
                 return [422, { error: "Failed to create chat due to data validation.", details: result.error }];
            }
            return [500, { error: "Failed to create chat on the server.", details: result.error }];
        }
    }
    // NOTE on jwtToken_passed_from_client_for_this_call_if_needed:
    // If fetchUserDetails in your Node.js backend requires a JWT to call the PHP API,
    // the client (frontend) must send its JWT when making the "create chat" request.
    // The Node.js `index.js` `extractJwt` middleware would put it on `req.jwtToken`.
    // You'd then pass `req.jwtToken` from `index.js` into this `create_chat` method.
    // For now, I've left it as a placeholder in the comment.

    async get_chats_for_external_user(externalUserId, DB, jwtToken) {
        console.log(`Controller: Getting chats for external user ${externalUserId}`);
        if (!externalUserId || typeof externalUserId !== 'string' || externalUserId.trim() === '') {
            return [400, { error: "Valid external User ID (string) parameter is required." }];
        }
        if (!jwtToken) {
            return [401, { error: "Authentication token is required." }];
        }

        const result = await DB.getChatsByExternalParticipantId(externalUserId.trim());

        if (result.success && result.data) {
            const chatsWithParticipantNames = await Promise.all(
                result.data.map(async (chat) => { // chat is a lean object here
                    const participants = await Promise.all(
                        (chat.participantExternalIds || []).map(async (id) => {
                            const userDetails = await fetchUserDetails(id, jwtToken);
                            return {
                                externalId: id,
                                name: userDetails ? userDetails.name : `User ${id.slice(0,4)}`
                            };
                        })
                    );
                    return { ...chat, participants }; // Add enriched participants array
                })
            );
            return [200, chatsWithParticipantNames];
        } else {
            return [500, { error: "Error retrieving chats for external user.", details: result.error }];
        }
    }
}

module.exports = ChatController;