import { getPlayer2ApiKey } from '../utils/player2_auth.js';

const PLAYER2_API_BASE = 'https://api.player2.game/v1';

export class Player2 {
    static prefix = 'player2';
    
    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.url = url || PLAYER2_API_BASE;
        this.params = params || {};
    }

    async sendRequest(turns, systemMessage, stop_seq='***') {
        throw new Error('Player2 chat completions not yet implemented. Use Player2 for TTS only.');
    }
}

/**
 * Send TTS request to Player2 API
 * @param {string} text Text to speak
 * @param {string} model Model/voice configuration
 * @param {string} voice Voice ID or gender preference
 * @param {string} url API base URL
 * @returns {Promise<string>} Base64 encoded audio data
 */
const sendAudioRequest = async (text, model, voice, url) => {
    const apiKey = await getPlayer2ApiKey();
    const baseUrl = url || PLAYER2_API_BASE;
    
    // Parse voice configuration
    // Format: "voice_id" or "default" or "male"/"female"
    let requestBody = {
        text: text,
        speed: 1.0,
        audio_format: 'mp3'
    };

    if (voice && voice !== 'default') {
        // Check if voice is a specific voice ID or gender preference
        if (voice === 'male' || voice === 'female') {
            requestBody.voice_gender = voice;
            requestBody.voice_language = 'en_US'; // Default to English
        } else {
            // Assume it's a voice ID
            requestBody.voice_ids = [voice];
        }
    } else {
        // Use default settings
        requestBody.voice_gender = 'female';
        requestBody.voice_language = 'en_US';
    }

    // Add any additional parameters from model config
    if (typeof model === 'object' && model.params) {
        Object.assign(requestBody, model.params);
    }

    try {
        const response = await fetch(`${baseUrl}/tts/speak`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            if (response.status === 402) {
                throw new Error('Insufficient joules to complete TTS request. Please top up your Player2 account.');
            } else if (response.status === 401) {
                throw new Error('Player2 authentication failed. Please re-authenticate.');
            } else {
                throw new Error(`Player2 TTS request failed: ${response.status} ${response.statusText}`);
            }
        }

        const data = await response.json();
        let audioData = data.data;
        
        if (audioData) {
            // Check if it's a data URL format (data:audio/mp3;base64,...)
            if (audioData.startsWith('data:')) {
                const base64Index = audioData.indexOf('base64,');
                if (base64Index !== -1) {
                    audioData = audioData.substring(base64Index + 7); // Remove "base64," prefix
                }
            }
        }
        
        return audioData; // Base64 encoded audio
    } catch (error) {
        console.error('Player2 TTS Error:', error);
        throw error;
    }
};

/**
 * Get available voices from Player2 API
 * @returns {Promise<Array>} Array of available voices
 */
export const getPlayer2Voices = async () => {
    try {
        const apiKey = await getPlayer2ApiKey();
        
        const response = await fetch(`${PLAYER2_API_BASE}/tts/voices`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch voices: ${response.status}`);
        }

        const data = await response.json();
        return data.voices;
    } catch (error) {
        console.error('Failed to fetch Player2 voices:', error);
        return [];
    }
};

export const TTSConfig = {
    sendAudioRequest: sendAudioRequest,
    baseUrl: PLAYER2_API_BASE,
    getVoices: getPlayer2Voices
};