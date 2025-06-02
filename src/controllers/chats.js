// src/controllers/chats.js (Node.js Backend)
const { fetchUserDetails } = require('../utils/externalUserApi'); // Path might need adjustment

class ChatController {
    constructor() {
        // console.log("ChatController created successfully!"); // Optional: keep for debugging
    }

    async create_chat(body, DB) {
        console.log("Controller: Creating chat, body:", body);
        // creatorExternalId from body is no longer directly stored in schema as admin,
        // but it's still useful to ensure the creator is part of the participants.
        const { participantExternalIds, chatName, creatorExternalId } = body; 

        if (!participantExternalIds || !Array.isArray(participantExternalIds) || participantExternalIds.length === 0) {
            return [400, { error: "participantExternalIds is required as a non-empty array." }];
        }

        // Ensure all participant IDs are strings
        const processedParticipantIds = participantExternalIds.map(id => String(id).trim());

        // If a creatorExternalId is provided, ensure they are included in the participants.
        // This is good practice even if not an "admin".
        if (creatorExternalId) {
            const creatorIdStr = String(creatorExternalId).trim();
            if (!processedParticipantIds.includes(creatorIdStr)) {
                // Option 1: Add them automatically
                processedParticipantIds.push(creatorIdStr);
                console.log(`Creator ${creatorIdStr} was not in participants, added automatically.`);
                // Option 2: Return an error
                // return [400, { error: "Creator must be one of the participants." }];
            }
        } else if (processedParticipantIds.length === 1 && !chatName) {
             // If only one participant and no chat name, this is ambiguous.
             // Usually, a "notes to self" chat would have a name like "My Notes" or be initiated by the frontend with the user themselves.
             // For now, let the DB layer handle the "single participant must have name" rule.
        }

        // For a named chat (group or explicitly named 1-on-1) with more than one participant, a chatName is good practice.
        // If it's just two people and no name, it's a direct chat.
        // The DB layer handles if a 1-person chat *must* have a name.
        if (processedParticipantIds.length > 1 && !chatName && processedParticipantIds.length > 2) { // More than 2 people usually implies a group name
            // Could enforce group name here, or let frontend decide.
            // For now, allow unnamed groups, frontend can derive display name.
        }


        const result = await DB.createChat(
            [...new Set(processedParticipantIds)], // Ensure unique IDs are passed to DB
            chatName ? chatName.trim() : null
            // No isGroup or creatorExternalId needed for DB.createChat anymore
        );

        if (result.success) {
            const statusCode = result.existed ? 200 : 201; // OK if existed, Created if new
            let enrichedChat = result.data; // This is now a lean object or Mongoose doc

            // Enrich with participant details
            if (enrichedChat && enrichedChat.participantExternalIds) {
                const participantsDetails = await Promise.all(
                    enrichedChat.participantExternalIds.map(async (id) => {
                        // The JWT for PHP API call comes from the request that initiated this chat creation.
                        // It's passed in `body.jwtToken_passed_from_client_for_this_call_if_needed`
                        const userDetails = await fetchUserDetails(id, body.jwtToken_passed_from_client_for_this_call_if_needed);
                        return { externalId: id, name: userDetails ? userDetails.name : `User ${String(id).slice(0,4)}` };
                    })
                );
                // If result.data is a Mongoose doc, convert to plain object before adding new properties
                enrichedChat = enrichedChat.toObject ? enrichedChat.toObject() : { ...enrichedChat };
                enrichedChat.participants = participantsDetails;
            }
            return [statusCode, { message: result.existed ? "Chat already exists" : "Chat created successfully", chat: enrichedChat }];
        } else {
             if (result.error && (result.error.includes('validation failed') || result.error.includes('must have a name'))) {
                 return [422, { error: "Failed to create chat due to data validation.", details: result.error }];
            }
            return [500, { error: "Failed to create chat on the server.", details: result.error }];
        }
    }

    async get_chats_for_external_user(externalUserId, DB, jwtToken) { // jwtToken is for PHP API calls
        console.log(`Controller: Getting chats for external user ${externalUserId}`);
        if (!externalUserId || typeof externalUserId !== 'string' || externalUserId.trim() === '') {
            return [400, { error: "Valid external User ID (string) parameter is required." }];
        }
        if (!jwtToken) { // This token is for calls to PHP API (fetchUserDetails)
            // If Node.js itself is not secured, this check might be less about blocking the request
            // and more about whether we *can* enrich data.
            // For now, assume if it's missing, enrichment might fail.
            console.warn("JWT token missing in get_chats_for_external_user; participant name enrichment might be incomplete.");
        }

        const result = await DB.getChatsByExternalParticipantId(externalUserId.trim());

        if (result.success && result.data) {
            const chatsWithParticipantNames = await Promise.all(
                result.data.map(async (chat) => { // chat is a lean object here
                    const participants = await Promise.all(
                        (chat.participantExternalIds || []).map(async (id) => {
                            // Only try to fetch user details if a token is available for the PHP API call
                            const userDetails = jwtToken ? await fetchUserDetails(id, jwtToken) : null;
                            return {
                                externalId: id,
                                name: userDetails ? userDetails.name : `User ${String(id).slice(0,4)}`
                            };
                        })
                    );
                    // chat is already a plain object from .lean()
                    return { ...chat, participants };
                })
            );
            return [200, chatsWithParticipantNames];
        } else if (!result.success && result.error) {
             return [500, { error: "Error retrieving chats for external user.", details: result.error }];
        } else {
            return [404, { error: "No chats found or error occurred." }]; // Or 500 if result.error indicates server issue
        }
    }
}

module.exports = ChatController;