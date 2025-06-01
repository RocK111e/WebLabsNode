// src/utils/externalUserApi.js (Node.js Backend - using fetch)

const USER_API_BASE_URL = 'http://webphp.local'; // Your PHP API base URL

const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchUserDetails(externalUserId, jwtToken) { // jwtToken is for PHP API
    if (!externalUserId) {
        console.warn('fetchUserDetails: Missing externalUserId');
        return null;
    }
    if (!jwtToken) {
        console.warn(`fetchUserDetails: Missing jwtToken for fetching user ${externalUserId}. PHP API might require it.`);
        // Depending on PHP API auth, might still try or return null
    }

    if (userCache.has(externalUserId)) {
        const cachedEntry = userCache.get(externalUserId);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`Cache hit for user ${externalUserId}`);
            return cachedEntry.data;
        } else {
            userCache.delete(externalUserId);
        }
    }

    try {
        // This endpoint in your PHP app should return details for a single user/student
        const url = `${USER_API_BASE_URL}/api/app.php/students/${externalUserId}`; // MAKE SURE THIS PHP ENDPOINT EXISTS
        console.log(`Node.js fetching user details for ${externalUserId} from ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwtToken}`, // PHP API needs this token
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorBodyText = await response.text();
            console.error(`Error fetching user details from PHP for ${externalUserId}. Status: ${response.status}. Body: ${errorBodyText}`);
            return null;
        }

        const responseData = await response.json();

        if (responseData) {
            // Adjust to match PHP API response structure for a single student
            const userData = {
                id: responseData.id || externalUserId,
                name: responseData.name || responseData.Name || responseData.username || `User ${externalUserId.substring(0, 4)}`,
                // Add other fields if available and needed (e.g., surname, avatar)
            };
            userCache.set(externalUserId, { data: userData, timestamp: Date.now() });
            return userData;
        }
        return null;
    } catch (error) {
        console.error(`Network/parsing error in Node.js fetching user details for ${externalUserId}:`, error.message);
        return null;
    }
}

module.exports = {
    fetchUserDetails
};