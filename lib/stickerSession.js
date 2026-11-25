const crypto = require('crypto');
const fs = require('fs');
const { jidNormalizedUser, normalizeMessageContent } = require('@whiskeysockets/baileys');

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000; // 5 menit
const COMPLETED_GRACE_MS = 15 * 60 * 1000; // 15 menit retensi status selesai/kedaluwarsa
const MAX_SESSIONS = 500;

const CALLBACK_ID_REGEX = /^stk_opt:(no_audio|with_audio):([a-f0-9]+)$/i;
const PROMPT_MARKER = 'Pilihan Konversi Video Sticker';

const sessions = new Map();
const promptToRequest = new Map();

/**
 * Normalizes a WhatsApp JID by stripping device suffixes (e.g. `:12`).
 * @param {string} jid
 * @returns {string}
 */
function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    try {
        const normalized = jidNormalizedUser(jid);
        if (normalized) return normalized.toLowerCase();
    } catch {}
    const [userPart, domainPart] = jid.split('@');
    if (!domainPart) return jid.toLowerCase();
    const bareUser = userPart.split(':')[0];
    return `${bareUser}@${domainPart}`.toLowerCase();
}

/**
 * Collects all possible normalized sender JIDs (including PN/LID alt identifiers) from a message.
 * @param {object} message
 * @returns {string[]}
 */
function extractActorIds(message) {
    const key = message?.key || {};
    const candidates = [
        key.participant,
        key.participantAlt,
        message?.participant,
        key.remoteJid && !key.remoteJid.endsWith('@g.us') ? key.remoteJid : '',
        key.remoteJidAlt && !key.remoteJidAlt.endsWith('@g.us') ? key.remoteJidAlt : ''
    ];
    const set = new Set();
    for (const item of candidates) {
        const norm = normalizeJid(item);
        if (norm) set.add(norm);
    }
    return Array.from(set);
}

/**
 * Safely deletes a temporary media file if it exists.
 * @param {string} filePath
 */
function safeUnlink(filePath) {
    if (!filePath) return;
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error('[STICKER SESSION] Failed to remove temp file:', err?.message || err);
    }
}

/**
 * Schedules removal of finished/expired metadata from the in-memory maps.
 * @param {string} requestId
 * @param {number} graceMs
 */
function scheduleMetadataPrune(requestId, graceMs = COMPLETED_GRACE_MS) {
    const session = sessions.get(requestId);
    if (!session) return;
    if (session.pruneTimer) clearTimeout(session.pruneTimer);
    session.pruneTimer = setTimeout(() => {
        deleteSessionRecord(requestId);
    }, graceMs);
    if (typeof session.pruneTimer.unref === 'function') {
        session.pruneTimer.unref();
    }
}

/**
 * Deletes a session record completely from memory and removes any leftover temp file.
 * @param {string} requestId
 */
function deleteSessionRecord(requestId) {
    const session = sessions.get(requestId);
    if (!session) return;
    if (session.timer) clearTimeout(session.timer);
    if (session.pruneTimer) clearTimeout(session.pruneTimer);
    if (session.mediaPath) safeUnlink(session.mediaPath);
    if (session.promptMessageId) {
        promptToRequest.delete(session.promptMessageId);
    }
    sessions.delete(requestId);
}

/**
 * Evicts oldest completed/expired or oldest pending entries if the store grows past MAX_SESSIONS.
 */
function enforceSessionLimit() {
    if (sessions.size < MAX_SESSIONS) return;
    for (const [id, sess] of sessions.entries()) {
        if (sess.status === 'completed' || sess.status === 'expired') {
            deleteSessionRecord(id);
            if (sessions.size < MAX_SESSIONS) return;
        }
    }
    const oldestKey = sessions.keys().next().value;
    if (oldestKey) deleteSessionRecord(oldestKey);
}

/**
 * Marks a pending session as expired, cleans up its temporary video file, and invokes optional callback.
 * @param {string} requestId
 */
async function expireSession(requestId) {
    const session = sessions.get(requestId);
    if (!session || session.status !== 'pending') return;
    session.status = 'expired';
    if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
    }
    if (session.mediaPath) {
        safeUnlink(session.mediaPath);
        session.mediaPath = null;
    }
    if (typeof session.onExpire === 'function') {
        try {
            await session.onExpire(session);
        } catch (err) {
            console.error('[STICKER SESSION] onExpire error:', err?.message || err);
        }
    }
    scheduleMetadataPrune(requestId);
}

/**
 * Creates a new pending video-to-sticker selection session.
 * @param {object} params
 * @returns {object} created session metadata
 */
function createStickerSession({
    chatId,
    senderIds,
    mediaPath,
    mimetype,
    seconds = 0,
    sourceMessage,
    ttlMs = DEFAULT_SESSION_TTL_MS,
    onExpire
}) {
    enforceSessionLimit();

    const requestId = crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const session = {
        requestId,
        chatId,
        senderIds: Array.isArray(senderIds) ? senderIds.map(normalizeJid).filter(Boolean) : [],
        mediaPath,
        mimetype: mimetype || 'video/mp4',
        seconds: Number(seconds) || 0,
        sourceMessage,
        promptMessageId: null,
        createdAt: now,
        expiresAt: now + ttlMs,
        status: 'pending',
        onExpire,
        timer: null,
        pruneTimer: null
    };

    session.timer = setTimeout(() => {
        expireSession(requestId);
    }, ttlMs);
    if (typeof session.timer.unref === 'function') {
        session.timer.unref();
    }

    sessions.set(requestId, session);
    return session;
}

/**
 * Links the interactive prompt message ID to the pending sticker session.
 * @param {string} requestId
 * @param {string} promptMessageId
 */
function attachPromptMessageId(requestId, promptMessageId) {
    const session = sessions.get(requestId);
    if (!session || !promptMessageId) return;
    session.promptMessageId = promptMessageId;
    promptToRequest.set(promptMessageId, requestId);
}

/**
 * Checks whether any actor JID matches the original video sender.
 * @param {object} session
 * @param {string[]} actorIds
 * @returns {boolean}
 */
function isAuthorizedSender(session, actorIds) {
    if (!session || !Array.isArray(actorIds) || actorIds.length === 0) return false;
    const normalizedActors = actorIds.map(normalizeJid).filter(Boolean);
    return normalizedActors.some(id => session.senderIds.includes(id));
}

/**
 * Extracts raw text from a text or extendedTextMessage.
 * @param {object} msgContent
 * @returns {string}
 */
function extractPlainText(msgContent) {
    if (!msgContent) return '';
    return (
        msgContent.conversation ||
        msgContent.extendedTextMessage?.text ||
        ''
    ).trim();
}

/**
 * Parses an incoming WhatsApp message to see if it is a sticker option callback
 * (interactive quick_reply button, legacy button reply, template reply, or quoted numeric reply).
 * @param {object} message
 * @returns {{ choice: 'no_audio'|'with_audio', requestId: string|null, source: string, promptMessageId?: string, expiredReply?: boolean }|null}
 */
function parseStickerCallback(message) {
    const rawMsg = message?.message;
    if (!rawMsg) return null;
    const msg = (typeof normalizeMessageContent === 'function' ? normalizeMessageContent(rawMsg) : rawMsg) || rawMsg;

    // 1. Native Flow Interactive Response (quick_reply button)
    const nativeFlow = msg.interactiveResponseMessage?.nativeFlowResponseMessage;
    if (nativeFlow?.paramsJson) {
        try {
            const parsed = JSON.parse(nativeFlow.paramsJson);
            const id = String(parsed?.id || '').trim();
            const match = id.match(CALLBACK_ID_REGEX);
            if (match) {
                return {
                    choice: match[1].toLowerCase(),
                    requestId: match[2].toLowerCase(),
                    source: 'interactive_button',
                    promptMessageId: msg.interactiveResponseMessage?.contextInfo?.stanzaId || undefined
                };
            }
        } catch {}
    }

    // 2. Legacy Buttons Response
    const buttonId = msg.buttonsResponseMessage?.selectedButtonId?.trim();
    if (buttonId) {
        const match = buttonId.match(CALLBACK_ID_REGEX);
        if (match) {
            return {
                choice: match[1].toLowerCase(),
                requestId: match[2].toLowerCase(),
                source: 'buttons_response',
                promptMessageId: msg.buttonsResponseMessage?.contextInfo?.stanzaId || undefined
            };
        }
    }

    // 3. Template Button Reply
    const templateId = msg.templateButtonReplyMessage?.selectedId?.trim();
    if (templateId) {
        const match = templateId.match(CALLBACK_ID_REGEX);
        if (match) {
            return {
                choice: match[1].toLowerCase(),
                requestId: match[2].toLowerCase(),
                source: 'template_button',
                promptMessageId: msg.templateButtonReplyMessage?.contextInfo?.stanzaId || undefined
            };
        }
    }

    // 4. Quoted Text Reply Fallback ("1" / "2" / choice text replying to the bot's prompt message)
    const extCtx = msg.extendedTextMessage?.contextInfo;
    const quotedId = extCtx?.stanzaId;
    const rawText = extractPlainText(msg).toLowerCase();
    if (quotedId && rawText) {
        let choice = null;
        if (rawText === '1' || rawText === 'tanpa audio' || rawText === 'no audio' || rawText === 'sticker tanpa audio') {
            choice = 'no_audio';
        } else if (rawText === '2' || rawText === 'dengan audio' || rawText === 'with audio' || rawText === 'sticker dengan audio') {
            choice = 'with_audio';
        }

        if (choice) {
            if (promptToRequest.has(quotedId)) {
                return {
                    choice,
                    requestId: promptToRequest.get(quotedId),
                    source: 'quoted_reply',
                    promptMessageId: quotedId
                };
            }
            const quotedBody = JSON.stringify(extCtx?.quotedMessage || '');
            if (quotedBody.includes(PROMPT_MARKER)) {
                return {
                    choice,
                    requestId: null,
                    source: 'quoted_reply',
                    promptMessageId: quotedId,
                    expiredReply: true
                };
            }
        }
    }

    return null;
}

/**
 * Attempts to acquire an exclusive processing lock on a pending sticker session.
 * Prevents unauthorized users, expired callbacks, and duplicate concurrent clicks.
 * @param {string|null} requestId
 * @param {string} chatId
 * @param {string[]} actorIds
 * @returns {{ ok: boolean, reason?: string, session?: object }}
 */
function acquireStickerSession(requestId, chatId, actorIds) {
    if (!requestId) {
        return { ok: false, reason: 'expired' };
    }
    const session = sessions.get(requestId);
    if (!session) {
        return { ok: false, reason: 'not_found' };
    }
    if (chatId && session.chatId && session.chatId !== chatId) {
        return { ok: false, reason: 'wrong_chat' };
    }
    if (session.status === 'expired' || (session.status === 'pending' && Date.now() > session.expiresAt)) {
        if (session.status === 'pending') {
            session.status = 'expired';
            if (session.timer) clearTimeout(session.timer);
            if (session.mediaPath) {
                safeUnlink(session.mediaPath);
                session.mediaPath = null;
            }
            scheduleMetadataPrune(requestId);
        }
        return { ok: false, reason: 'expired' };
    }
    if (!isAuthorizedSender(session, actorIds)) {
        return { ok: false, reason: 'unauthorized' };
    }
    if (session.status === 'processing') {
        return { ok: false, reason: 'already_processing' };
    }
    if (session.status === 'completed') {
        return { ok: false, reason: 'already_used' };
    }

    session.status = 'processing';
    if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
    }

    return { ok: true, session };
}

/**
 * Marks a session as completed, removes temporary files, and retains minimal status briefly to reject repeat clicks.
 * @param {string} requestId
 */
function completeStickerSession(requestId) {
    const session = sessions.get(requestId);
    if (!session) return;
    session.status = 'completed';
    if (session.timer) {
        clearTimeout(session.timer);
        session.timer = null;
    }
    if (session.mediaPath) {
        safeUnlink(session.mediaPath);
        session.mediaPath = null;
    }
    scheduleMetadataPrune(requestId);
}

/**
 * Clears all sessions (intended for test teardown).
 */
function clearAllStickerSessions() {
    for (const requestId of Array.from(sessions.keys())) {
        deleteSessionRecord(requestId);
    }
    promptToRequest.clear();
}

module.exports = {
    DEFAULT_SESSION_TTL_MS,
    PROMPT_MARKER,
    normalizeJid,
    extractActorIds,
    createStickerSession,
    attachPromptMessageId,
    parseStickerCallback,
    acquireStickerSession,
    completeStickerSession,
    deleteSessionRecord,
    clearAllStickerSessions,
    getSession: (id) => sessions.get(id)
};
