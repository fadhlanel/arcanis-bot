const pinnedMessages = new Map();

async function pinCommand(sock, chatId, message, unpin = false) {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    
    const pin = pinnedMessages.get(chatId);
    
    // Unpin: use exact key stored during pin
    if (unpin) {
        if (!pin?.key) {
            await sock.sendMessage(chatId, { text: '❌ Tidak ada pesan yang sedang di-pin.' }, { quoted: message });
            return;
        }
        
        try {
            await sock.sendMessage(chatId, { pin: pin.key, type: 0 });
            pinnedMessages.delete(chatId);
            await sock.sendMessage(chatId, { text: '✅ Pesan di-unpin.' }, { quoted: message });
        } catch (err) {
            console.error('[Pin] Unpin error:', err.message);
            await sock.sendMessage(chatId, { text: '❌ Gagal unpin pesan. Coba lagi.' }, { quoted: message });
        }
        return;
    }
    
    // Pin: use replied message key
    const repliedKey = contextInfo?.stanzaId ? {
        remoteJid: chatId,
        fromMe: contextInfo.participant === sock.user?.id,
        id: contextInfo.stanzaId,
        ...(contextInfo.participant && { participant: contextInfo.participant })
    } : null;
    
    if (!repliedKey) {
        await sock.sendMessage(chatId, { text: '❌ Reply pesan yang ingin di-pin dengan `.pin`.' }, { quoted: message });
        return;
    }
    
    // Parse duration
    const durationKey = text.trim().split(/\s+/)[1]?.toLowerCase().replace(/\s+/g, '');
    const durations = { '24jam': 86400, '7hari': 604800, '30hari': 2592000 };
    const duration = durations[durationKey] || 86400;
    
    try {
        console.log('[Pin] Pin key:', JSON.stringify(repliedKey));
        await sock.sendMessage(chatId, { pin: repliedKey, type: 1, time: duration });
        console.log('[Pin] Pin message sent');
        
        // Store for unpin
        pinnedMessages.set(chatId, { key: repliedKey, timestamp: Date.now() });
        
        const durationLabel = { 86400: '24 jam', 604800: '7 hari', 2592000: '30 hari' }[duration] || '24 jam';
        await sock.sendMessage(chatId, { 
            text: `✅ Pesan di-pin selama ${durationLabel}.` 
        }, { quoted: message });
    } catch (err) {
        console.error('[Pin] Pin error:', err.message);
        await sock.sendMessage(chatId, { text: '❌ Gagal pin pesan. Coba lagi.' }, { quoted: message });
    }
}

module.exports = pinCommand;
