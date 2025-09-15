import { TTSConfig } from './src/models/player2.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

async function testSSMLDirectly() {
    console.log('=== Testing Player2 SSML Processing ===\n');

    const tests = [
        {
            name: "Plain text",
            text: "This is normal speed speech."
        },
        {
            name: "SSML slow speech",
            text: "<speak><prosody rate=\"0.5\">This is very slow speech.</prosody></speak>"
        },
        {
            name: "SSML fast speech", 
            text: "<speak><prosody rate=\"2.0\">This is very fast speech.</prosody></speak>"
        },
        {
            name: "SSML with emphasis",
            text: "<speak>This has <emphasis>emphasized words</emphasis> in it.</speak>"
        }
    ];

    for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        console.log(`\n${i + 1}. Testing: ${test.name}`);
        console.log(`   Text: ${test.text}`);
        
        try {
            const audioData = await TTSConfig.sendAudioRequest(
                test.text, 
                'default', 
                'female', 
                'https://api.player2.game/v1'
            );
            
            console.log(`   ✓ Generated ${audioData.length} bytes of audio`);
            
            // Save and play the audio file
            const tmpPath = path.join(os.tmpdir(), `ssml_test_${i + 1}.mp3`);
            await fs.writeFile(tmpPath, Buffer.from(audioData, 'base64'));
            console.log(`   📁 Saved to: ${tmpPath}`);
            
            // Play the audio
            console.log(`   🔊 Playing audio...`);
            const player = spawn('ffplay', ['-nodisp', '-autoexit', tmpPath], {
                stdio: 'ignore', 
                windowsHide: true
            });
            
            // Wait for playback to finish
            await new Promise((resolve) => {
                player.on('exit', () => {
                    resolve();
                });
            });
            
            console.log(`   ✅ Playback completed`);
            
            // Clean up
            try {
                await fs.unlink(tmpPath);
            } catch {}
            
        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
        
        // Small delay between tests
        if (i < tests.length - 1) {
            console.log(`   ⏳ Waiting 2 seconds before next test...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n=== Test completed ===');
    console.log('Listen carefully to each audio clip to hear if SSML effects are applied.');
}

testSSMLDirectly().catch(console.error);