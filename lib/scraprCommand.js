const { downloadAndSend } = require('./scraprDownloader');

function createScraprCommand({ command, aliases, platform, domain, label }) {
    const prefix = new RegExp(`^\\.(?:${[command, ...(aliases || [])].join('|')})\\s*`, 'i');
    return async function commandHandler(sock, chatId, message) {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const url = text.replace(prefix, '').trim();
        if (!url || !domain.test(url)) {
            await sock.sendMessage(chatId, { text: `❌ Berikan link ${label || platform}.` }, { quoted: message });
            return;
        }
        try {
            await sock.sendMessage(chatId, { text: `⏳ Mendownload dari ${label || platform}...` }, { quoted: message });
            await downloadAndSend(sock, chatId, message, platform, url);
        } catch (error) {
            const cause = String(error?.message || '').split('\n')[0].trim().slice(0, 160);
            await sock.sendMessage(chatId, { text: `❌ Gagal download ${label || platform}. Coba link lain.${cause ? `\n penyebab: ${cause}` : ''}` }, { quoted: message });
        }
    };
}

module.exports = createScraprCommand;
