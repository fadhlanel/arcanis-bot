const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function unwrap(message) {
    return message?.viewOnceMessage?.message || message?.viewOnceMessageV2?.message || message?.viewOnceMessageV2Extension?.message || message;
}

async function download(media, type) {
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function viewonceCommand(sock, chatId, message) {
    try {
        const context = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || message.message?.videoMessage?.contextInfo;
        const quoted = unwrap(context?.quotedMessage);
        const image = quoted?.imageMessage;
        const video = quoted?.videoMessage;

        if (image) {
            const buffer = await download(image, 'image');
            return sock.sendMessage(chatId, { image: buffer, caption: image.caption || '' }, { quoted: message });
        }
        if (video) {
            const buffer = await download(video, 'video');
            return sock.sendMessage(chatId, { video: buffer, mimetype: 'video/mp4', caption: video.caption || '' }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '❌ Balas pesan gambar atau video view-once dengan .vv.' }, { quoted: message });
    } catch (error) {
        console.error('View-once error:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Gagal mengambil media view-once. Media mungkin sudah kedaluwarsa.' }, { quoted: message });
    }
}

module.exports = viewonceCommand;
