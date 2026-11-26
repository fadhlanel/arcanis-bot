const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
    MAX_VIDEO_INPUT_BYTES,
    MAX_AUDIO_STICKER_DURATION_SEC,
    ensureTmpDir,
    classifyAndValidateMedia,
    convertImageBufferToSticker,
    convertVideoFileToAnimatedSticker,
    probeVideoStream
} = require('../lib/stickerMedia');
const {
    downloadVideoForSoundSticker,
    sendVideoAsSoundSticker,
    formatAudioStickerError
} = require('../lib/soundSticker');
const {
    DEFAULT_SESSION_TTL_MS,
    PROMPT_MARKER,
    extractActorIds,
    createStickerSession,
    attachPromptMessageId,
    parseStickerCallback,
    acquireStickerSession,
    completeStickerSession
} = require('../lib/stickerSession');

/**
 * Formats a user-friendly error message for sticker conversion failures.
 * @param {Error} error
 * @returns {string}
 */
function formatStickerErrorMessage(error) {
    switch (error?.code) {
        case 'INVALID_VIDEO':
            return `❌ ${error.message || 'Video tidak valid atau rusak.'}`;
        case 'NO_AUDIO_STREAM':
            return `❌ ${error.message || 'Video tidak memiliki audio stream.'}`;
        case 'UNSUPPORTED_AUDIO_FORMAT':
            return `❌ ${error.message || 'Format audio pada video tidak didukung.'}`;
        case 'AUDIO_TRANSCODE_FAILED':
        case 'TRANSCODE_FAILED':
            return `❌ ${error.message || 'Proses konversi media gagal. Coba gunakan video lain.'}`;
        case 'SIZE_EXCEEDED':
        case 'DURATION_EXCEEDED':
            return `❌ ${error.message || 'Durasi atau ukuran melebihi batas sticker WhatsApp.'}`;
        case 'FFMPEG_MISSING':
        case 'FFMPEG_NOT_FOUND':
        case 'FFMPEG_TIMEOUT':
        case 'FFMPEG_FAILED':
        case 'NO_AUDIO':
        case 'SILENT_AUDIO':
        case 'INVALID_AUDIO':
        case 'VIDEO_TOO_LARGE':
        case 'STICKER_TOO_LARGE':
        case 'VIDEO_NOT_FOUND':
        case 'VIEW_ONCE_REJECTED':
        case 'UNSUPPORTED_VIDEO':
        case 'VIDEO_METADATA_MISSING':
        case 'MEDIA_INTEGRITY_FAILED':
        case 'VIDEO_DOWNLOAD_FAILED':
        case 'VIDEO_DOWNLOAD_TIMEOUT':
        case 'UPLOAD_FAILED':
        case 'BAD_JID':
        case 'BAD_SOCKET':
        case 'BAD_OPTIONS':
        case 'NO_VIDEO':
            return formatAudioStickerError(error);
        default:
            return '❌ Gagal membuat sticker! Pastikan file valid dan coba lagi nanti.';
    }
}

/**
 * Validates a cached video and sends it as a native WhatsApp sound sticker.
 * @param {object} sock
 * @param {string} chatId
 * @param {object} sourceMessage Original command/reply message containing the video
 * @param {string} videoPath Cached temporary video file
 * @param {object} [deps]
 * @returns {Promise<{ ok: boolean, code?: string, message?: string }>}
 */
async function sendAudioSticker(sock, chatId, sourceMessage, videoPath, deps = {}) {
    let probe;
    try {
        probe = await probeVideoStream(videoPath, { runBinary: deps.runBinary });
    } catch (err) {
        return { ok: false, code: err.code || 'INVALID_VIDEO', message: formatStickerErrorMessage(err) };
    }

    if (!probe.valid || !probe.hasVideo) {
        return {
            ok: false,
            code: 'INVALID_VIDEO',
            message: '❌ Video tidak valid atau rusak sehingga tidak dapat diproses.'
        };
    }
    if (!probe.hasAudio) {
        return {
            ok: false,
            code: 'NO_AUDIO',
            message: '❌ Video ini tidak memiliki audio stream, jadi tidak bisa dibuat menjadi Audio Sticker. Pilih *Sticker Tanpa Audio*.'
        };
    }
    if (probe.duration > MAX_AUDIO_STICKER_DURATION_SEC) {
        return {
            ok: false,
            code: 'DURATION_EXCEEDED',
            message: `❌ Durasi video (${probe.duration.toFixed(1)} detik) melebihi batas maksimal Audio Sticker (${MAX_AUDIO_STICKER_DURATION_SEC} detik). Pilih *Sticker Tanpa Audio* atau potong videonya terlebih dahulu.`
        };
    }

    const audio = deps.soundSticker || { downloadVideoForSoundSticker, sendVideoAsSoundSticker };
    const mediaHost = typeof sock.getMediaHost === 'function' ? sock.getMediaHost() : undefined;
    const video = await audio.downloadVideoForSoundSticker(sourceMessage, {
        mediaHost,
        timeoutMs: deps.downloadTimeoutMs
    });
    await audio.sendVideoAsSoundSticker(sock, chatId, video, {
        quoted: sourceMessage,
        startSeconds: 0,
        timeoutMs: deps.convertTimeoutMs
    });
    return { ok: true };
}

/**
 * Sends an interactive 2-button prompt asking the user to choose between
 * animated sticker without audio or audio sticker.
 * Falls back gracefully to a numbered text prompt if `relayMessage` is unavailable or fails.
 * @param {object} sock
 * @param {string} chatId
 * @param {object} messageToQuote
 * @param {string} requestId
 * @param {number} ttlMs
 * @returns {Promise<string|null>} Prompt message key ID
 */
async function sendStickerChoicePrompt(sock, chatId, messageToQuote, requestId, ttlMs = DEFAULT_SESSION_TTL_MS) {
    const ttlMinutes = Math.max(1, Math.round(ttlMs / 60000));
    const bodyText = [
        `🎬 *${PROMPT_MARKER}*`,
        '',
        'Pilih jenis sticker untuk video ini:',
        '1️⃣ 🔇 *Sticker Tanpa Audio* (Animasi biasa)',
        '2️⃣ 🔊 *Sticker Dengan Audio* (Audio Sticker, maks 5 detik)',
        '',
        `💡 _Balas pesan ini dengan angka *1* atau *2*._`,
        `_(Atau gunakan langsung: \`.s 1\` atau \`.s 2\`)_`,
        '',
        `⏱️ Berlaku ${ttlMinutes} menit • Hanya pengirim video yang dapat memilih`
    ].join('\n');

    const promptMsg = await sock.sendMessage(
        chatId,
        { text: bodyText },
        { quoted: messageToQuote }
    );
    return promptMsg?.key?.id || null;
}

/**
 * Handles `.sticker` / `.s` command for both static images and videos/GIFs.
 * Static images are converted immediately (preserving legacy behavior).
 * Videos are validated, cached into an isolated session, and presented with 2 choices.
 * @param {object} sock
 * @param {string} chatId
 * @param {object} message
 * @param {object} [deps]
 */
async function stickerCommand(sock, chatId, message, deps = {}) {
    const messageToQuote = message;
    let targetMessage = message;

    // Ambil teks perintah untuk mendeteksi argumen instan (misal .s 1, .s 2, .s audio)
    const rawCmdText = (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        message.message?.imageMessage?.caption ||
        message.message?.videoMessage?.caption ||
        ''
    ).trim();

    // Deteksi opsi instan dari perintah
    let directChoice = null;
    if (/\.(?:sticker|s)\s+(?:1|noaudio|tanpa)$/i.test(rawCmdText)) {
        directChoice = 'no_audio';
    } else if (/\.(?:sticker|s)\s+(?:2|audio|suara)$/i.test(rawCmdText)) {
        directChoice = 'with_audio';
    }

    // If the message is a reply, the target media is in the quoted message.
    if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = message.message.extendedTextMessage.contextInfo;
        targetMessage = {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }

    const mediaMessage =
        targetMessage.message?.imageMessage ||
        targetMessage.message?.videoMessage ||
        targetMessage.message?.documentMessage;

    if (!mediaMessage) {
        await sock.sendMessage(chatId, {
            text: 'Please reply to an image/video with .sticker, or send an image/video with .sticker as the caption.'
        }, { quoted: messageToQuote });
        return;
    }

    try {
        // Early file size guard before downloading large videos
        const declaredSize = Number(mediaMessage.fileLength || 0);
        if (declaredSize > MAX_VIDEO_INPUT_BYTES) {
            await sock.sendMessage(chatId, {
                text: `❌ Ukuran file (${(declaredSize / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal ${MAX_VIDEO_INPUT_BYTES / (1024 * 1024)} MB.`
            }, { quoted: messageToQuote });
            return;
        }

        const downloadFn = deps.downloadMediaMessage || downloadMediaMessage;
        const mediaBuffer = await downloadFn(targetMessage, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
            await sock.sendMessage(chatId, {
                text: 'Failed to download media. Please try again.'
            }, { quoted: messageToQuote });
            return;
        }

        const classification = await classifyAndValidateMedia(mediaMessage, mediaBuffer);

        if (classification.kind === 'unsupported') {
            await sock.sendMessage(chatId, {
                text: `❌ ${classification.reason || 'Format file tidak didukung untuk sticker.'}`
            }, { quoted: messageToQuote });
            return;
        }

        // Static image -> preserve existing instant static sticker conversion
        if (classification.kind === 'image') {
            const finalBuffer = await convertImageBufferToSticker(mediaBuffer, {
                runBinary: deps.runBinary
            });
            await sock.sendMessage(chatId, {
                sticker: finalBuffer
            }, { quoted: messageToQuote });
            return;
        }

        // Video / GIF -> persist to tmp disk
        const tmpDir = ensureTmpDir();
        const safeExt = String(classification.ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
        const tempVideoPath = path.join(tmpDir, `pending_vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${safeExt}`);
        fs.writeFileSync(tempVideoPath, mediaBuffer);

        // Jika user langsung menyertakan argumen (misal .s 1 atau .s 2), langsung proses tanpa menunggu prompt
        if (directChoice) {
            try {
                if (directChoice === 'no_audio') {
                    await sock.sendMessage(chatId, { text: '⏳ Sedang memproses video menjadi *Sticker Animasi (Tanpa Audio)*...' }, { quoted: messageToQuote }).catch(() => {});
                    const stickerBuffer = await convertVideoFileToAnimatedSticker(tempVideoPath, { runBinary: deps.runBinary });
                    await sock.sendMessage(chatId, { sticker: stickerBuffer }, { quoted: messageToQuote });
                } else {
                    await sock.sendMessage(chatId, { text: '⏳ Sedang memeriksa audio dan memproses *Audio Sticker*...' }, { quoted: messageToQuote }).catch(() => {});
                    const audioResult = await sendAudioSticker(sock, chatId, messageToQuote, tempVideoPath, deps);
                    if (!audioResult.ok) {
                        await sock.sendMessage(chatId, { text: audioResult.message }, { quoted: messageToQuote });
                    }
                }
            } finally {
                try { if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath); } catch {}
            }
            return;
        }

        const ttlMs = deps.ttlMs || DEFAULT_SESSION_TTL_MS;
        const senderIds = extractActorIds(message);

        const session = createStickerSession({
            chatId,
            senderIds,
            mediaPath: tempVideoPath,
            mimetype: classification.mimetype,
            seconds: mediaMessage.seconds || 0,
            sourceMessage: messageToQuote,
            ttlMs,
            onExpire: async (expiredSession) => {
                if (deps.notifyOnExpire === false) return;
                await sock.sendMessage(expiredSession.chatId, {
                    text: '⏱️ Waktu pemilihan konversi sticker habis karena tidak ada tombol yang dipilih. Silakan kirim ulang video dengan perintah .sticker jika masih diperlukan.'
                }, { quoted: expiredSession.sourceMessage }).catch(() => {});
            }
        });

        try {
            const promptMsgId = await sendStickerChoicePrompt(sock, chatId, messageToQuote, session.requestId, ttlMs);
            if (promptMsgId) {
                attachPromptMessageId(session.requestId, promptMsgId);
            }
        } catch (promptErr) {
            // Rollback session if sending prompt fails
            console.error('[STICKER CMD] prompt error:', promptErr);
            completeStickerSession(session.requestId);
            throw promptErr;
        }
    } catch (error) {
        console.error('[STICKER CMD] Error:', error);
        await sock.sendMessage(chatId, {
            text: formatStickerErrorMessage(error)
        }, { quoted: messageToQuote }).catch(() => {});
    }
}

/**
 * Handles interactive button callbacks or quoted numeric replies for pending video-to-sticker requests.
 * @param {object} sock
 * @param {string} chatId
 * @param {object} message
 * @param {object} [deps]
 * @returns {Promise<boolean>} True if the message was handled as a sticker callback
 */
async function handleStickerCallback(sock, chatId, message, deps = {}) {
    const parsed = parseStickerCallback(message);
    if (!parsed) return false;

    if (parsed.expiredReply) {
        await sock.sendMessage(chatId, {
            text: '⚠️ Sesi konversi video ini sudah kedaluwarsa atau telah selesai. Silakan kirim ulang video dengan perintah .sticker.'
        }, { quoted: message });
        return true;
    }

    const actorIds = extractActorIds(message);
    const acquired = acquireStickerSession(parsed.requestId, chatId, actorIds);

    if (!acquired.ok) {
        const reasonMessages = {
            unauthorized: '❌ Hanya pengirim video yang dapat memilih opsi sticker ini.',
            already_processing: '⏳ Video ini sedang dalam proses konversi sticker. Mohon tunggu sebentar.',
            already_used: 'ℹ️ Opsi untuk video ini sudah diproses sebelumnya. Kirim video baru dengan .sticker jika ingin membuat lagi.',
            expired: '⚠️ Sesi konversi video ini sudah kedaluwarsa. Silakan kirim ulang video dengan perintah .sticker.',
            not_found: '⚠️ Sesi konversi video ini sudah kedaluwarsa atau tidak ditemukan. Silakan kirim ulang video dengan perintah .sticker.',
            wrong_chat: '⚠️ Sesi konversi video ini tidak berasal dari chat ini.'
        };
        await sock.sendMessage(chatId, {
            text: reasonMessages[acquired.reason] || reasonMessages.expired
        }, { quoted: message });
        return true;
    }

    const { session } = acquired;
    const choiceLabel = parsed.choice === 'with_audio' ? 'Audio Sticker' : 'Sticker Tanpa Audio';

    // Processing indicator
    await sock.sendMessage(chatId, {
        react: { text: '⏳', key: message.key }
    }).catch(() => {});
    await sock.sendMessage(chatId, {
        text: `⏳ Sedang memproses video menjadi *${choiceLabel}*...`
    }, { quoted: message }).catch(() => {});

    try {
        if (parsed.choice === 'no_audio') {
            const stickerBuffer = await convertVideoFileToAnimatedSticker(session.mediaPath, {
                runBinary: deps.runBinary
            });
            try {
                await sock.sendMessage(chatId, {
                    sticker: stickerBuffer
                }, { quoted: session.sourceMessage || message });
            } catch (sendErr) {
                console.error('Error sending animated sticker:', sendErr);
                await sock.sendMessage(chatId, {
                    text: '❌ Sticker berhasil dibuat tetapi gagal dikirim ke WhatsApp. Silakan coba lagi.'
                }, { quoted: message }).catch(() => {});
            }
            return true;
        }

        // Native Audio Sticker via @xbibzlibrary/whatsbibz
        const audioResult = await sendAudioSticker(
            sock,
            chatId,
            session.sourceMessage || message,
            session.mediaPath,
            deps
        );

        if (!audioResult.ok) {
            await sock.sendMessage(chatId, {
                text: audioResult.message
            }, { quoted: session.sourceMessage || message });
        }
        return true;
    } catch (error) {
        console.error('Error processing sticker callback:', error);
        await sock.sendMessage(chatId, {
            text: formatStickerErrorMessage(error)
        }, { quoted: session.sourceMessage || message }).catch(() => {});
        return true;
    } finally {
        completeStickerSession(session.requestId);
    }
}

stickerCommand.handleStickerCallback = handleStickerCallback;
stickerCommand.sendStickerChoicePrompt = sendStickerChoicePrompt;

module.exports = stickerCommand;
