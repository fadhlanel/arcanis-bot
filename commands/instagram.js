const { downloadAndSend } = require('../lib/scraprDownloader');

async function instagramCommand(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = text.replace(/^\.(?:instagram|insta|ig)\s*/i, '').trim();
    if (!url || !/instagram\.com/i.test(url)) {
        return await sock.sendMessage(chatId, { text: '❌ Berikan link Instagram.\nContoh: .ig https://instagram.com/p/...' }, { quoted: message });
    }
    try {
        await sock.sendMessage(chatId, { text: '⏳ Mendownload dari Instagram...' }, { quoted: message });
        await downloadAndSend(sock, chatId, message, 'instagram', url, { videoOnly: true, singleItem: true });
    } catch {
        await sock.sendMessage(chatId, { text: '❌ Gagal download Instagram. Coba link lain.' }, { quoted: message });
    }
}

module.exports = instagramCommand;
