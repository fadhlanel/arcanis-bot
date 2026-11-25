const { downloadMediaMessage, generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
    MAX_VIDEO_INPUT_BYTES,
    ensureTmpDir,
    classifyAndValidateMedia,
    convertImageBufferToSticker,
    convertVideoFileToAnimatedSticker,
    processAudioStickerPipeline
} = require('../lib/stickerMedia');
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
            return '❌ Layanan konversi media (FFmpeg) belum tersedia di server.';
        default:
            return '❌ Gagal membuat sticker! Pastikan file valid dan coba lagi nanti.';
    }
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
        'Pilih jenis sticker animasi untuk video ini:',
        '1️⃣ 🔇 *Sticker Tanpa Audio*',
        '2️⃣ 🔊 *Sticker Dengan Audio*',
        '',
        `_Ketuk salah satu tombol di bawah, atau balas pesan ini dengan angka *1* atau *2*._`
    ].join('\n');
    const footerText = `Berlaku ${ttlMinutes} menit • Hanya pengirim video yang dapat memilih`;

    if (typeof sock.relayMessage === 'function') {
        try {
            const interactiveMsg = generateWAMessageFromContent(
                chatId,
                {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                header: proto.Message.InteractiveMessage.Header.create({
                                    title: 'Konversi Video ke Sticker',
                                    hasMediaAttachment: false
                                }),
                                body: proto.Message.InteractiveMessage.Body.create({
                                    text: bodyText
                                }),
                                footer: proto.Message.InteractiveMessage.Footer.create({
                                    text: footerText
                                }),
                                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                    buttons: [
                                        {
                                            name: 'quick_reply',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: '🔇 Sticker Tanpa Audio',
                                                id: `stk_opt:no_audio:${requestId}`
                                            })
                                        },
                                        {
                                            name: 'quick_reply',
                                            buttonParamsJson: JSON.stringify({
                                                display_text: '🔊 Sticker Dengan Audio',
                                                id: `stk_opt:with_audio:${requestId}`
                                            })
                                        }
                                    ]
                                })
                            })
                        }
                    }
                },
                {
                    quoted: messageToQuote,
                    userJid: sock.user?.id
                }
            );

            await sock.relayMessage(chatId, interactiveMsg.message, {
                messageId: interactiveMsg.key.id,
                additionalNodes: [
                    {
                        tag: 'biz',
                        attrs: {},
                        content: [
                            {
                                tag: 'interactive',
                                attrs: { type: 'native_flow', v: '1' },
                                content: [
                                    { tag: 'native_flow', attrs: { name: 'quick_reply' } }
                                ]
                            }
                        ]
                    }
                ]
            });

            return interactiveMsg?.key?.id || null;
        } catch (relayErr) {
            console.warn('[STICKER] Interactive prompt relay failed, falling back to text prompt:', relayErr?.message || relayErr);
        }
    }

    const fallbackMsg = await sock.sendMessage(
        chatId,
        { text: `${bodyText}\n\n_${footerText}_` },
        { quoted: messageToQuote }
    );
    return fallbackMsg?.key?.id || null;
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
    console.log('[STICKER CMD] received', { chatId, hasReply: !!message.message?.extendedTextMessage?.contextInfo?.quotedMessage, fromMe: message.key.fromMe });
    const messageToQuote = message;
    let targetMessage = message;

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
        console.log('[STICKER CMD] reply detected, targetMessage keys:', Object.keys(targetMessage.message || {}));
    }

    const mediaMessage =
        targetMessage.message?.imageMessage ||
        targetMessage.message?.videoMessage ||
        targetMessage.message?.documentMessage;
    console.log('[STICKER CMD] mediaMessage type:', mediaMessage ? Object.keys(mediaMessage)[0] : 'none', '| hasVideo:', !!targetMessage.message?.videoMessage);

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
        console.log('[STICKER CMD] downloaded buffer:', mediaBuffer ? mediaBuffer.length : 0);

        if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
            await sock.sendMessage(chatId, {
                text: 'Failed to download media. Please try again.'
            }, { quoted: messageToQuote });
            return;
        }

        const classification = await classifyAndValidateMedia(mediaMessage, mediaBuffer);
        console.log('[STICKER CMD] classification:', classification);

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

        // Video / GIF -> persist to tmp disk and ask user via interactive buttons
        const tmpDir = ensureTmpDir();
        const safeExt = String(classification.ext || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
        const tempVideoPath = path.join(tmpDir, `pending_vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${safeExt}`);
        fs.writeFileSync(tempVideoPath, mediaBuffer);
        console.log('[STICKER CMD] temp video saved:', tempVideoPath);

        const ttlMs = deps.ttlMs || DEFAULT_SESSION_TTL_MS;
        const senderIds = extractActorIds(message);
        console.log('[STICKER CMD] senderIds:', senderIds);

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
        console.log('[STICKER CMD] session created:', session.requestId);

        try {
            const promptMsgId = await sendStickerChoicePrompt(sock, chatId, messageToQuote, session.requestId, ttlMs);
            console.log('[STICKER CMD] prompt sent, msgId:', promptMsgId);
            if (promptMsgId) {
                attachPromptMessageId(session.requestId, promptMsgId);
                console.log('[STICKER CMD] promptMessageId attached');
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
    console.log('[STICKER CALLBACK] received', { chatId, messageType: Object.keys(message.message || {})[0] });
    const parsed = parseStickerCallback(message);
    console.log('[STICKER CALLBACK] parsed:', parsed);
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

        // Audio Sticker branch (separated from regular animated sticker)
        const audioResult = await processAudioStickerPipeline(session.mediaPath, {
            runBinary: deps.runBinary,
            waProto: deps.waProto,
            maxDurationSec: deps.maxDurationSec
        });

        if (!audioResult.ok) {
            await sock.sendMessage(chatId, {
                text: audioResult.message
            }, { quoted: session.sourceMessage || message });
            return true;
        }

        // Forward-compatible native sending when WAProto / Baileys supports Audio Sticker
        if (typeof deps.sendNativeAudioSticker === 'function') {
            await deps.sendNativeAudioSticker(sock, chatId, audioResult, session.sourceMessage || message);
        } else {
            await sock.sendMessage(chatId, {
                text: '⚠️ Adapter pengiriman Audio Sticker native belum tersedia untuk konfigurasi socket saat ini.'
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
