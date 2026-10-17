const fetch = require('node-fetch');

async function handleSsCommand(sock, chatId, message, match) {
    if (!match) return sock.sendMessage(chatId, { text: 'Usage: .ss <url>' }, { quoted: message });
    const url = match.trim();
    if (!/^https?:\/\//i.test(url)) return sock.sendMessage(chatId, { text: '❌ URL tidak valid.' }, { quoted: message });
    try {
        const endpoint = new URL('https://knightbotapi.stream/api/ssweb');
        endpoint.searchParams.set('apikey', process.env.KNIGHTBOT_API_KEY || 'knight');
        endpoint.searchParams.set('url', url);
        const response = await fetch(endpoint);
        const data = await response.json();
        const imageUrl = typeof data.result === 'string'
            ? data.result
            : data.result?.download || data.result?.url;
        if (!data.success || !imageUrl) throw new Error(data.result?.error || 'Invalid SSWeb response');
        await sock.sendMessage(chatId, { image: { url: imageUrl } }, { quoted: message });
    } catch (error) {
        console.error('SSWeb error:', error.message);
        await sock.sendMessage(chatId, { text: '❌ Gagal membuat screenshot.' }, { quoted: message });
    }
}

module.exports = { handleSsCommand };
