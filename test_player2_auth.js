import { getPlayer2ApiKey, clearPlayer2Cache, validatePlayer2Key } from './src/utils/player2_auth.js';
import { getPlayer2Voices } from './src/models/player2.js';

async function testPlayer2Auth() {
    console.log('=== Testing Player2 Authentication ===\n');

    try {
        // Clear any cached keys for testing
        clearPlayer2Cache();
        
        // Test authentication
        console.log('1. Testing authentication...');
        const apiKey = await getPlayer2ApiKey();
        console.log(`✓ Authentication successful! Key: ${apiKey.substring(0, 10)}...`);

        // Test key validation
        console.log('\n2. Validating API key...');
        const isValid = await validatePlayer2Key(apiKey);
        console.log(`✓ Key validation: ${isValid ? 'VALID' : 'INVALID'}`);

        // Test voices endpoint
        console.log('\n3. Fetching available voices...');
        const voices = await getPlayer2Voices();
        console.log(`✓ Found ${voices.length} available voices:`);
        
        voices.slice(0, 5).forEach(voice => {
            console.log(`  - ${voice.name} (${voice.id}) - ${voice.language} ${voice.gender}`);
        });
        
        if (voices.length > 5) {
            console.log(`  ... and ${voices.length - 5} more voices`);
        }

        console.log('\n=== All tests passed! ===');
        
    } catch (error) {
        console.error('\n❌ Authentication failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testPlayer2Auth();