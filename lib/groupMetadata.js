const cache = new Map();

async function getGroupMetadata(sock, chatId, ttl = 30000) {
    const now = Date.now();
    const cached = cache.get(chatId);
    if (cached && cached.expires > now) return cached.value;
    try {
        const value = await sock.groupMetadata(chatId);
        cache.set(chatId, { value, expires: now + ttl });
        return value;
    } catch (error) {
        // Keep last known participant list during WhatsApp rate limits.
        if (cached?.value) return cached.value;
        throw error;
    }
}

function clearGroupMetadata(chatId) {
    cache.delete(chatId);
}

module.exports = { getGroupMetadata, clearGroupMetadata };
