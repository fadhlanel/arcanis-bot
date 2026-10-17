const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const dataDir = path.join(process.cwd(), 'data');
const warningsPath = path.join(dataDir, 'warnings.json');
const antispamPath = path.join(dataDir, 'antispam.json');

async function unwarnCommand(sock, chatId, senderId, mentionedJids, message, userMessage) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, { text: '.unwarn hanya bisa dipakai di grup.' }, { quoted: message });
    }

    const args = userMessage.trim().split(/\s+/).slice(1);
    const amount = Number(args.find(arg => /^\d+$/.test(arg)) || 0);
    const target = mentionedJids?.[0] || message.message?.extendedTextMessage?.contextInfo?.participant;
    if (!amount || !Number.isSafeInteger(amount) || !target) {
        return sock.sendMessage(chatId, { text: 'Cara pakai: reply pesan user lalu kirim .unwarn <jumlah>, atau .unwarn <jumlah> @user.\nContoh: .unwarn 2 @user' }, { quoted: message });
    }

    try {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        if (!isBotAdmin || !isSenderAdmin) {
            return sock.sendMessage(chatId, { text: !isBotAdmin ? 'Bot harus menjadi admin.' : 'Hanya admin grup yang bisa memakai .unwarn.' }, { quoted: message });
        }

        const warnings = fs.existsSync(warningsPath) ? JSON.parse(fs.readFileSync(warningsPath, 'utf8')) : {};
        const targetNumber = target.split('@')[0];
        const warningKey = Object.keys(warnings[chatId] || {}).find(key => key === target || key.split('@')[0] === targetNumber) || target;
        const current = Number(warnings[chatId]?.[warningKey] || warnings[target] || warnings[targetNumber] || 0);
        const remaining = Math.max(0, current - amount);
        if (!warnings[chatId]) warnings[chatId] = {};
        warnings[chatId][warningKey] = remaining;
        if (warnings[target] !== undefined) warnings[target] = remaining;
        if (warnings[targetNumber] !== undefined) warnings[targetNumber] = remaining;
        fs.mkdirSync(path.dirname(warningsPath), { recursive: true });
        fs.writeFileSync(warningsPath, JSON.stringify(warnings, null, 2));

        // Keep anti-spam counter aligned so next spam warning increments from adjusted count.
        if (fs.existsSync(antispamPath)) {
            const spamData = JSON.parse(fs.readFileSync(antispamPath, 'utf8'));
            const spamKey = `${chatId}:${target}`;
            const matchingSpamKey = spamData[spamKey] ? spamKey : Object.keys(spamData).find(key => key.startsWith(`${chatId}:`) && key.split(':').pop().split('@')[0] === targetNumber);
            if (matchingSpamKey && spamData[matchingSpamKey]) {
                spamData[matchingSpamKey].warned = remaining;
                fs.writeFileSync(antispamPath, JSON.stringify(spamData, null, 2));
            }
        }

        await sock.sendMessage(chatId, {
            text: `✅ Warning @${target.split('@')[0]} dikurangi ${Math.min(amount, current)}. Sisa: ${remaining}/4.`,
            mentions: [target]
        }, { quoted: message });
    } catch (error) {
        console.error('[unwarn] Failed:', error.message);
        await sock.sendMessage(chatId, { text: 'Gagal mengurangi warning.' }, { quoted: message });
    }
}

module.exports = unwarnCommand;
