const axios = require('axios');

module.exports = async function (sock, chatId, message, city) {
    try {
        if (!city) {
            return sock.sendMessage(chatId, { text: 'Tulis nama kota dulu, bestie. Contoh: .weather Bandung' }, { quoted: message });
        }
        const { data } = await axios.get('https://api.siputzx.my.id/api/info/cuaca', { params: { q: city }, timeout: 30000 });
        const weather = data?.result || data?.data || data;
        const current = weather?.weather?.[0] || weather;
        const temp = weather?.main?.temp ?? weather?.temperature ?? weather?.temp;
        const desc = current?.description || current?.main || weather?.description || 'nggak tersedia';
        await sock.sendMessage(chatId, { text: `🌤️ *Cuaca ${weather?.name || city}*\n\nKondisi: ${desc}\nSuhu: ${temp ?? '-'}°C` }, { quoted: message });
    } catch (error) {
        console.error('Weather API error:', error.message);
        await sock.sendMessage(chatId, { text: 'Cuacanya lagi nggak kebaca. Coba kota lain atau ulangi bentar.' }, { quoted: message });
    }
};
