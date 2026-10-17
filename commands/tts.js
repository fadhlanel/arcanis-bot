const axios = require('axios');

module.exports = async function ttsCommand(sock, chatId, text, message, language = 'id') {
    if (!text) return sock.sendMessage(chatId, { text: 'Tulis teksnya dulu, bestie. Contoh: .tts halo semua' }, { quoted: message });
    try {
        const words = text.trim().split(/\s+/);
        if (/^[a-z]{2}$/i.test(words[0])) language = words.shift().toLowerCase();
        const { data } = await axios.get('https://knightbotapi.stream/api/tts', {
            params: { apikey: process.env.KNIGHTBOT_API_KEY || 'knight', lang: language, text: words.join(' ') },
            timeout: 60000
        });
        const audioUrl = typeof data?.result === 'string' ? data.result : data?.result?.url || data?.result?.download;
        if (!data?.success || !audioUrl) throw new Error('TTS returned no audio');
        await sock.sendMessage(chatId, { audio: { url: audioUrl }, mimetype: 'audio/mpeg', ptt: false }, { quoted: message });
    } catch (error) {
        console.error('TTS API error:', error.message);
        await sock.sendMessage(chatId, { text: 'TTS-nya lagi error. Coba teks lain atau ulangi bentar.' }, { quoted: message });
    }
};
