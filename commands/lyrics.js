const fetch = require('node-fetch');
const API_KEY = process.env.KNIGHTBOT_API_KEY || 'knight';

async function lyricsCommand(sock, chatId, songTitle, message) {
    if (!songTitle) {
        await sock.sendMessage(chatId, { 
            text: '🔍 Please enter the song name to get the lyrics! Usage: *lyrics <song name>*'
        },{ quoted: message });
        return;
    }

    try {
        // Use lyricsapi.fly.dev and return only the raw lyrics text
        const apiUrl = `https://knightbotapi.stream/api/lyrics?apikey=${encodeURIComponent(API_KEY)}&query=${encodeURIComponent(songTitle)}`;
        const res = await fetch(apiUrl);
        
        if (!res.ok) {
            const errText = await res.text();
            throw errText;
        }
        
        const data = await res.json();

        const lyrics = typeof data?.result === 'string' ? data.result : data?.result?.lyrics || data?.lyrics || null;
        if (!lyrics) {
            await sock.sendMessage(chatId, {
                text: `❌ Sorry, I couldn't find any lyrics for "${songTitle}".`
            },{ quoted: message });
            return;
        }

        const maxChars = 4096;
        const output = lyrics.length > maxChars ? lyrics.slice(0, maxChars - 3) + '...' : lyrics;

        await sock.sendMessage(chatId, { text: output }, { quoted: message });
    } catch (error) {
        console.error('Error in lyrics command:', error);
        await sock.sendMessage(chatId, { 
            text: `❌ An error occurred while fetching the lyrics for "${songTitle}".`
        },{ quoted: message });
    }
}

module.exports = { lyricsCommand };
