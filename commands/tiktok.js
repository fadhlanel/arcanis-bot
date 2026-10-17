const { downloadAndSend } = require('../lib/scraprDownloader');

async function tiktokCommand(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = text.replace(/^\.(?:tiktok|tt)\s*/i, '').trim();
    if (!url || !/tiktok\.com/i.test(url)) {
        return await sock.sendMessage(chatId, { text: '❌ Berikan link TikTok.\nContoh: .tiktok https://vt.tiktok.com/...' }, { quoted: message });
    }
    try {
        await sock.sendMessage(chatId, { text: '⏳ Mendownload dari TikTok...' }, { quoted: message });
        await downloadAndSend(sock, chatId, message, 'tiktok', url);
    } catch {
        await sock.sendMessage(chatId, { text: '❌ Gagal download TikTok. Coba link lain.' }, { quoted: message });
    }
}

module.exports = tiktokCommand;
