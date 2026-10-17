const isAdmin = require('../lib/isAdmin');

async function groupLockCommand(sock, chatId, senderId, message, lock) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: 'Command ini cuma bisa dipakai di grup, bestie.' }, { quoted: message });
    }
    const status = await isAdmin(sock, chatId, senderId);
    if (!status.isBotAdmin) {
        return sock.sendMessage(chatId, { text: 'Bot belum jadi admin nih. Naikin role bot dulu.' }, { quoted: message });
    }
    if (!status.isSenderAdmin) {
        return sock.sendMessage(chatId, { text: 'Yang bisa ngatur lock grup cuma admin, ya.' }, { quoted: message });
    }
    try {
        await sock.groupSettingUpdate(chatId, lock ? 'announcement' : 'not_announcement');
        await sock.sendMessage(chatId, {
            text: lock ? '🔒 Grup dikunci. Sekarang cuma admin yang bisa chat.' : '🔓 Grup dibuka lagi. Semua member bisa chat.'
        }, { quoted: message });
    } catch (error) {
        console.error('Group lock error:', error.message);
        await sock.sendMessage(chatId, { text: 'Gagal ubah lock grup. Coba lagi, ya.' }, { quoted: message });
    }
}

module.exports = groupLockCommand;
