const axios = require('axios');
const sharp = require('sharp');

async function bratCommand(sock, chatId, message) {
    const raw = message.message?.conversation?.trim() || message.message?.extendedTextMessage?.text?.trim() || '';
    const parts = raw.split(/\s+/).slice(1);
    if (!parts.length) {
        return sock.sendMessage(chatId, { text: 'Cara pakai: .brat <teks> [gerak]\nContoh: .brat halo gerak' }, { quoted: message });
    }

    const animatedIndex = parts.findIndex(part => part.toLowerCase() === 'gerak');
    const isAnimated = animatedIndex !== -1;
    if (isAnimated) parts.splice(animatedIndex, 1);
    const text = parts.join(' ').trim();
    if (!text) return sock.sendMessage(chatId, { text: 'Teks brat-nya belum ada, bestie.' }, { quoted: message });

    const delay = 110;

    try {
        const { data, headers } = await axios.get('https://api.siputzx.my.id/api/m/brat', {
            params: { text, delay, ...(isAnimated ? { isAnimated: true } : {}) },
            responseType: 'arraybuffer',
            timeout: 30000,
            validateStatus: status => status >= 200 && status < 400
        });
        const contentType = headers['content-type'] || '';
        if (!contentType.startsWith('image/')) throw new Error(`API returned ${contentType || 'non-image'}`);
        const input = Buffer.from(data);
        const webp = await sharp(input, isAnimated ? { animated: true } : {})
            .resize(512, 512, { fit: 'contain', background: '#ffffff' })
            .webp(isAnimated ? { quality: 75, loop: 0, delay } : { quality: 75 })
            .toBuffer();
        await sock.sendMessage(chatId, { sticker: webp }, { quoted: message });
    } catch (error) {
        console.error('Brat API error:', error.message);
        await sock.sendMessage(chatId, { text: 'Brat-nya gagal dibuat. API lagi ngambek, coba ulangi bentar.' }, { quoted: message });
    }
}

module.exports = bratCommand;
