const axios = require('axios');
const settings = require('../settings');
const messages = require('../lib/messages');

const AI_ENDPOINTS = {
    gpt: [
        { name: 'EliteProTech GPT', url: 'https://eliteprotech-apis.zone.id/ai/chatgpt' },
        { name: 'KnightBot GPT', url: 'https://knightbotapi.stream/api/ai/gpt', needsKey: true }
    ],
    gemini: [
        { name: 'EliteProTech Gemini', url: 'https://eliteprotech-apis.zone.id/ai/notegpt' },
        { name: 'KnightBot Gemini', url: 'https://knightbotapi.stream/api/ai/gemini', needsKey: true }
    ]
};

async function aiCommand(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const [command, ...words] = text.trim().split(/\s+/);
    const query = words.join(' ').trim();
    
    if (!query) {
        return sock.sendMessage(chatId, { text: messages.aiUsage }, { quoted: message });
    }
    
    const maxCharacters = Number(settings.aiMaxCharacters) || 2000;
    if (query.length > maxCharacters) {
        return sock.sendMessage(chatId, {
            text: messages.aiTooLong(maxCharacters, query.length)
        }, { quoted: message });
    }

    try {
        await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
        
        const isGPT = command.toLowerCase() === '.gpt';
        const endpoints = isGPT ? AI_ENDPOINTS.gpt : AI_ENDPOINTS.gemini;
        let answer = null;
        let lastError = null;
        
        for (const endpoint of endpoints) {
            try {
                console.log(`[AI] Trying ${endpoint.name}...`);
                const params = endpoint.needsKey 
                    ? { apikey: process.env.KNIGHTBOT_API_KEY || 'knight', q: query }
                    : { text: query };
                
                const { data } = await axios.get(endpoint.url, {
                    params,
                    timeout: 30000
                });
                
                answer = data.result || data.answer || data.data || data.message || data.response;
                
                if (answer) {
                    console.log(`[AI] Success from ${endpoint.name}`);
                    break;
                }
            } catch (err) {
                console.log(`[AI] ${endpoint.name} failed:`, err.message);
                lastError = err;
            }
        }
        
        if (!answer) {
            throw new Error(lastError?.message || 'Invalid AI response');
        }
        
        const output = String(answer).trim();
        await sock.sendMessage(chatId, {
            text: messages.aiResponse(output)
        }, { quoted: message });
        
    } catch (error) {
        console.error('AI API error:', error.message);
        await sock.sendMessage(chatId, { text: '❌ AI gagal merespons. Coba lagi nanti.' }, { quoted: message });
    }
}

module.exports = aiCommand;
