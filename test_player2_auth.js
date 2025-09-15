import { getPlayer2ApiKey, clearPlayer2Cache, validatePlayer2Key } from './src/utils/player2_auth.js';
import { getPlayer2Voices, TTSConfig } from './src/models/player2.js';

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

        // Test SSML support
        console.log('\n4. Testing SSML support...');
        const ssmlTests = [
            // Test 1: Basic SSML with speak tags
            '<speak>Hello, this is a <emphasis>test</emphasis> of SSML support.</speak>',
            // Test 2: Prosody (rate/pitch changes)
            '<speak>This is <prosody rate="slow">slow speech</prosody> and <prosody rate="fast">fast speech</prosody>.</speak>',
            // Test 3: Break/pause
            '<speak>First part. <break time="1s"/> Second part after pause.</speak>',
            // Test 4: Plain text (control)
            'This is plain text without SSML tags.'
        ];

        for (let i = 0; i < ssmlTests.length; i++) {
            const testText = ssmlTests[i];
            console.log(`\n   Test ${i + 1}: ${testText.length > 60 ? testText.substring(0, 60) + '...' : testText}`);
            
            try {
                const audioData = await TTSConfig.sendAudioRequest(testText, 'default', 'female', 'https://api.player2.game/v1');
                console.log(`   ✓ Generated audio: ${audioData.length} bytes`);
                
                // Check if the response seems different (indicating SSML processing)
                if (i === 0) {
                    console.log(`   📝 Baseline audio length: ${audioData.length} bytes`);
                }
            } catch (error) {
                console.log(`   ❌ Failed: ${error.message}`);
            }
        }

        console.log('\n=== All tests completed! ===');
        console.log('\nSSML Notes:');
        console.log('- Compare audio lengths and quality between SSML and plain text');
        console.log('- If SSML is supported, prosody/emphasis should affect output');
        console.log('- Listen to the generated audio to detect differences');
        
    } catch (error) {
        console.error('\n❌ Authentication failed:', error.message);
        process.exit(1);
    }
}

// Run the test
testPlayer2Auth();