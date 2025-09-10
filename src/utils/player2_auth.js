import { getKey, hasKey } from './keys.js';

const PLAYER2_API_BASE = 'https://api.player2.game/v1';
const PLAYER2_APP_PORT = 4315;
const GAME_CLIENT_ID = '019930e7-360d-7226-9820-2227ef47ec15';

let cachedP2Key = null;

/**
 * Get Player2 API key using multiple authentication methods
 * @returns {Promise<string>} P2 API key
 */
export async function getPlayer2ApiKey() {
    // Return cached key if available
    if (cachedP2Key) {
        return cachedP2Key;
    }

    // Check if key is stored in keys.json
    if (hasKey('PLAYER2_API_KEY')) {
        cachedP2Key = getKey('PLAYER2_API_KEY');
        return cachedP2Key;
    }

    try {
        // Method 1: Try Player2 App authentication (localhost)
        console.log('Attempting Player2 App authentication...');
        const appKey = await tryPlayer2AppAuth();
        if (appKey) {
            cachedP2Key = appKey;
            console.log('✓ Player2 App authentication successful');
            return appKey;
        }
    } catch (error) {
        console.log('Player2 App not available, trying device flow...');
    }

    try {
        // Method 2: Device Authorization Flow
        console.log('Starting Player2 Device Authorization Flow...');
        const deviceKey = await deviceAuthFlow();
        if (deviceKey) {
            cachedP2Key = deviceKey;
            console.log('✓ Device authorization successful');
            return deviceKey;
        }
    } catch (error) {
        console.error('Device authorization failed:', error.message);
    }

    throw new Error('Failed to authenticate with Player2. Please ensure you have the Player2 App installed or complete the device authorization flow.');
}

/**
 * Try authenticating with local Player2 App
 * @returns {Promise<string|null>} P2 API key or null if failed
 */
async function tryPlayer2AppAuth() {
    try {
        const response = await fetch(`http://localhost:${PLAYER2_APP_PORT}/v1/login/web/${GAME_CLIENT_ID}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 5000 // 5 second timeout
        });

        if (!response.ok) {
            throw new Error(`Player2 App responded with status: ${response.status}`);
        }

        const data = await response.json();
        return data.p2Key;
    } catch (error) {
        // Player2 App not running or not logged in
        return null;
    }
}

/**
 * Perform Device Authorization Flow
 * @returns {Promise<string>} P2 API key
 */
async function deviceAuthFlow() {
    // Step 1: Start device flow
    console.log('Step 1: Starting device authorization...');
    const deviceResponse = await fetch(`${PLAYER2_API_BASE}/login/device/new`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: GAME_CLIENT_ID
        })
    });

    if (!deviceResponse.ok) {
        throw new Error(`Device flow start failed: ${deviceResponse.status}`);
    }

    const deviceData = await deviceResponse.json();
    const { deviceCode, userCode, verificationUri, verificationUriComplete, expiresIn, interval } = deviceData;

    // Step 2: Display instructions to user
    console.log('\n=== Player2 Authentication Required ===');
    console.log(`Please visit: ${verificationUriComplete}`);
    console.log(`Or go to: ${verificationUri}`);
    console.log(`And enter code: ${userCode}`);
    console.log(`This code expires in ${expiresIn} seconds`);
    console.log('=========================================\n');

    // Step 3: Poll for authorization
    console.log('Waiting for authorization...');
    const pollUntil = Date.now() + (expiresIn * 1000);
    
    while (Date.now() < pollUntil) {
        await sleep(interval * 1000);
        
        try {
            const tokenResponse = await fetch(`${PLAYER2_API_BASE}/login/device/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    client_id: GAME_CLIENT_ID,
                    device_code: deviceCode,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                })
            });

            if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                return tokenData.p2Key;
            }
            
            // Continue polling if not ready yet
            console.log('Still waiting for authorization...');
        } catch (error) {
            console.log('Polling error, retrying...');
        }
    }

    throw new Error('Device authorization timed out. Please try again.');
}

/**
 * Clear cached API key (for testing or re-authentication)
 */
export function clearPlayer2Cache() {
    cachedP2Key = null;
}

/**
 * Sleep helper function
 * @param {number} ms Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate if a P2 key is still valid
 * @param {string} p2Key API key to validate
 * @returns {Promise<boolean>} True if valid
 */
export async function validatePlayer2Key(p2Key) {
    try {
        const response = await fetch(`${PLAYER2_API_BASE}/health`, {
            headers: {
                'Authorization': `Bearer ${p2Key}`
            }
        });
        return response.ok;
    } catch {
        return false;
    }
}