const { detectPlatformFromUrl, downloadAndSend, log } = require('../lib/scraprDownloader');

async function univmp4Command(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = text.replace(/^\.univmp4\s*/i, '').trim();
    if (!url) return sock.sendMessage(chatId, { text: '❌ Penggunaan: .univmp4 <link>' }, { quoted: message });

    const platform = detectPlatformFromUrl(url);
    if (!platform) return sock.sendMessage(chatId, { text: '❌ URL tidak didukung.' }, { quoted: message });

    try {
        await sock.sendMessage(chatId, { text: `⏳ Mendownload video dari ${platform}...` }, { quoted: message });
        await downloadAndSend(sock, chatId, message, platform, url, { mediaType: 'video', singleItem: true });
    } catch (error) {
        log(platform, 'COMMAND_ERROR', `command=univmp4 error=${error.message}`);
        await sock.sendMessage(chatId, { text: '❌ Gagal download video. Coba link lain.' }, { quoted: message });
    }
}

module.exports = univmp4Command;
