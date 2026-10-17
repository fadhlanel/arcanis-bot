const axios = require('axios');
const scrapr = require('@coflyn/scrapr');
const { scrapeUrl, downloadBuffer, log } = require('../lib/scraprDownloader');


async function playCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const query = text.replace(/^\.(?:play|song)\s*/i, '').trim();
        
        if (!query) {
            return await sock.sendMessage(chatId, { 
                text: "❌ Berikan judul lagu.\nContoh: .play Bohemian Rhapsody"
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, { text: `🔎 Mencari: ${query}...` }, { quoted: message });

        // Search YouTube first
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        const searchResponse = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Extract first video ID from search results
        const videoIdMatch = searchResponse.data.match(/"videoId":"([^"]{11})"/);
        
        if (!videoIdMatch) {
            throw new Error('No video found');
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;

        await sock.sendMessage(chatId, { text: '⏳ Mendownload audio...' }, { quoted: message });

        let result;
        try {
            result = await scrapr.youtube.ytmp3(videoUrl);
            if (!result?.url) throw new Error('direct scraper returned no audio');
        } catch (directError) {
            log('youtube', 'FALLBACK', `play direct failed: ${directError.message}`);
            const fallback = await scrapeUrl('youtube', videoUrl);
            const audio = fallback.downloads.find(item => /audio|mp3|m4a/i.test(String(item.type || '') + item.url));
            if (!audio?.url) throw new Error('No audio URL from fallback scraper');
            result = { url: audio.url, title: fallback.title, duration: fallback.duration };
        }

        const audioResponse = await axios.get(result.url, {
            responseType: 'arraybuffer',
            timeout: 90000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const audioBuffer = Buffer.from(audioResponse.data);
        
        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            caption: `🎵 ${result.title || query}\n⏱️ ${result.duration || ''}`
        }, { quoted: message });

    } catch (error) {
        console.error('[Play]', error.message);
        await sock.sendMessage(chatId, { 
            text: "❌ Gagal download lagu. Coba judul lain."
        }, { quoted: message });
    }
}

module.exports = playCommand;
