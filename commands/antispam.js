const fs = require('fs');
const path = require('path');
const messages = require('../lib/messages');
const warningsFile = path.join(__dirname, '../data/warnings.json');

const dataFile = path.join(__dirname, '../data/antispam.json');

function loadData() {
    try {
        if (fs.existsSync(dataFile)) {
            return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading antispam data:', e);
    }
    return {};
}

function scheduleMuteEnd(sock, chatId, senderId, muteUntil) {
    setTimeout(async () => {
        const data = loadData();
        const entry = data[`${chatId}:${senderId}`];
        if (!entry?.muteUntil || entry.muteUntil !== muteUntil || Date.now() < muteUntil) return;
        delete entry.muteUntil;
        saveData(data);
        await sock.sendMessage(chatId, {
            text: `✅ Mute @${senderId.split('@')[0]} telah berakhir. Warning tetap tersimpan: ${entry.warned || 0}/4.`,
            mentions: [senderId]
        });
    }, Math.max(0, muteUntil - Date.now()));
}

function saveWarnings(groupId, userId, count) {
    try {
        const warnings = fs.existsSync(warningsFile) ? JSON.parse(fs.readFileSync(warningsFile, 'utf8')) : {};
        if (!warnings[groupId]) warnings[groupId] = {};
        warnings[groupId][userId] = count;
        fs.writeFileSync(warningsFile, JSON.stringify(warnings, null, 2));
    } catch (error) {
        console.error('Error saving spam warning:', error.message);
    }
}

function saveData(data) {
    try {
        const dir = path.dirname(dataFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error saving antispam data:', e);
    }
}

async function handleAntiSpam(sock, chatId, senderId, message, isSticker = false) {
    const data = loadData();
    const groupKey = `${chatId}:${senderId}`;
    const now = Date.now();
    const existing = data[groupKey];

    // While muted, delete each new message so spam cannot stay in group.
    if (existing?.muteUntil && now < existing.muteUntil) {
        try {
            await sock.sendMessage(chatId, { delete: message.key });
        } catch (error) {
            console.error('Failed to delete muted user message:', error.message);
        }
        return true;
    }
    if (existing?.muteUntil) delete existing.muteUntil;

    if (!data[groupKey]) {
        data[groupKey] = { count: 1, type: isSticker ? 'sticker' : 'text', lastTime: now, warned: 0 };
        saveData(data);
        return;
    }

    const userSpam = data[groupKey];
    const timeDiff = now - userSpam.lastTime;
    const sameType = userSpam.type === (isSticker ? 'sticker' : 'text');

    // Reset if 5 seconds passed or type changed
    if (timeDiff > 5000 || !sameType) {
        data[groupKey] = { count: 1, type: isSticker ? 'sticker' : 'text', lastTime: now, warned: userSpam.warned || 0 };
        saveData(data);
        return;
    }

    // Increment spam count
    userSpam.count++;
    userSpam.lastTime = now;

    // Spam threshold: 6+ in 5 seconds
    if (userSpam.count >= 6) {
        const warned = (userSpam.warned || 0) + 1;
        userSpam.warned = warned;
        saveWarnings(chatId, senderId, warned);
        userSpam.count = 0;

        try {
            if (warned === 1) {
                // Internal mute: delete spammer messages while duration active.
                userSpam.muteUntil = now + 10 * 60 * 1000;
                await sock.sendMessage(chatId, {
                    text: messages.spamWarning(1, '10 menit').replace('@user', `@${senderId.split('@')[0]}`),
                    mentions: [senderId]
                });
                scheduleMuteEnd(sock, chatId, senderId, userSpam.muteUntil);
            } else if (warned === 2) {
                // Internal mute: delete spammer messages while duration active.
                userSpam.muteUntil = now + 10 * 60 * 1000;
                await sock.sendMessage(chatId, {
                    text: messages.spamWarning(2, '10 menit').replace('@user', `@${senderId.split('@')[0]}`),
                    mentions: [senderId]
                });
                scheduleMuteEnd(sock, chatId, senderId, userSpam.muteUntil);
            } else if (warned === 3) {
                userSpam.muteUntil = now + 60 * 60 * 1000;
                await sock.sendMessage(chatId, {
                    text: `⚠️ Peringatan terakhir untuk @${senderId.split('@')[0]} (3/4). Jika spam berlanjut dan mendapat warning lagi, pengguna akan dikeluarkan.`, 
                    mentions: [senderId]
                });
                scheduleMuteEnd(sock, chatId, senderId, userSpam.muteUntil);
            } else if (warned >= 4) {
                try {
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    await sock.sendMessage(chatId, {
                        text: `🚫 @${senderId.split('@')[0]} dikeluarkan karena mencapai 4 warning spam.`,
                        mentions: [senderId]
                    });
                    delete data[groupKey];
                    saveWarnings(chatId, senderId, 0);
                } catch (kickError) {
                    console.error('Error kicking user:', kickError);
                    await sock.sendMessage(chatId, { text: messages.botAdmin });
                }
            }
        } catch (e) {
            console.error('Error in antispam:', e);
        }
    }

    saveData(data);
    return false;
}

function resetUserSpam(chatId, senderId) {
    const data = loadData();
    const groupKey = `${chatId}:${senderId}`;
    delete data[groupKey];
    saveData(data);
}

function isUserMuted(chatId, senderId) {
    const data = loadData();
    const key = `${chatId}:${senderId}`;
    const entry = data[key];
    if (entry && entry.muteUntil && Date.now() < entry.muteUntil) return true;
    return false;
}

module.exports = { handleAntiSpam, resetUserSpam, isUserMuted };