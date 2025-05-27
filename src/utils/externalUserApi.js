// src/utils/externalUserApi.js

// Base URL for the external user API
const USER_API_BASE_URL = 'http://webphp.local/api/app.php/'; // Your actual base URL

// Simple in-memory cache for user details to reduce API calls
// In a production environment, consider a more robust caching solution (e.g., Redis)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchUserDetails(externalUserId, jwtToken) {
    if (!externalUserId || !jwtToken) {
        console.warn('fetchUserDetails: Missing externalUserId or jwtToken');
        return null;
    }

    // Check cache first
    if (userCache.has(externalUserId)) {
        const cachedEntry = userCache.get(externalUserId);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL) {
            console.log(`Cache hit for user ${externalUserId}`);
            return cachedEntry.data;
        } else {
            userCache.delete(externalUserId); // Cache expired
        }
    }

    try {
        const url = `${USER_API_BASE_URL}/students/${externalUserId}`;
        console.log(`Fetching user details for ${externalUserId} from ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json' // Often good to include
            }
        });

        if (!response.ok) {
            // Handle HTTP errors (4xx, 5xx)
            const errorBodyText = await response.text(); // Try to get error body as text
            console.error(`Error fetching user details for ${externalUserId}. Status: ${response.status}. Body: ${errorBodyText}`);
            if (response.status === 401) {
                console.error('Unauthorized access to external user API. JWT might be invalid or expired.');
            }
            if (response.status === 404) {
                console.warn(`User ${externalUserId} not found in external API.`);
            }
            return null;
        }

        const responseData = await response.json(); // Parse JSON response

        if (responseData) {
            // Adjust 'responseData.name' based on the actual structure of the API response
            const userData = {
                id: responseData.id || externalUserId,
                name: responseData.name || responseData.username || `User ${externalUserId.substring(0, 4)}`,
                // Add any other relevant fields you want to use: e.g., avatar: responseData.avatar_url
            };
            userCache.set(externalUserId, { data: userData, timestamp: Date.now() }); // Update cache
            return userData;
        }
        return null;
    } catch (error) {
        // This will catch network errors or errors during response.json()
        console.error(`Network or parsing error fetching user details for ${externalUserId}:`, error.message);
        return null;
    }
}

module.exports = {
    fetchUserDetails
};