const scrapr = require('@coflyn/scrapr');

async function spotifyCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const url = text.replace(/^\.spotify\s*/i, '').trim();
        if (!url || !/spotify\.com/i.test(url)) {
            return await sock.sendMessage(chatId, { text: '❌ Berikan link Spotify.\nContoh: .spotify https://open.spotify.com/track/...' }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Mengambil info Spotify...' }, { quoted: message });
        const methods = [scrapr.spotify?.spotmate, scrapr.spotify?.spotidown, scrapr.spotify?.soundloaders, scrapr.spotify?.spotisaver];
        let response;
        for (const m of methods) {
            try {
                response = await m(url);
                if (response?.status && response.result) break;
            } catch (_) {}
        }
        if (!response?.status) throw new Error('Tidak dapat mengambil info Spotify');
        const result = response.result;
        let caption = `🎵 *${result.title || 'Track'}*\n`;
        if (result.artist) caption += `👤 ${result.artist}\n`;
        if (result.album) caption += `💿 ${result.album}\n`;
        if (result.duration) caption += `⏱️ ${result.duration}\n`;
        if (result.releaseDate) caption += `📅 ${result.releaseDate}\n`;
        if (result.url) caption += `\n🔗 ${result.url}`;
        await sock.sendMessage(chatId, { text: caption }, { quoted: message });
    } catch (error) {
        console.error('[Spotify]', error.message);
        await sock.sendMessage(chatId, { text: '❌ Gagal ambil info Spotify. Coba link lain.' }, { quoted: message });
    }
}

module.exports = spotifyCommand;
