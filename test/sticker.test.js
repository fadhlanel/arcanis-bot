const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');
const { proto } = require('@whiskeysockets/baileys');

const stickerCommand = require('../commands/sticker');
const {
    MAX_VIDEO_INPUT_BYTES,
    addStickerExif,
    classifyAndValidateMedia,
    isNativeAudioStickerSupported,
    parseFfmpegInspectOutput,
    processAudioStickerPipeline
} = require('../lib/stickerMedia');
const {
    clearAllStickerSessions,
    parseStickerCallback
} = require('../lib/stickerSession');
const { handleMessages } = require('../main');

// Minimal valid 1x1 WebP image (RIFF/WEBP VP8L) verified with node-webpmux
const MINIMAL_WEBP = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
// Minimal PNG magic header + padding (enough for file-type detection)
const MINIMAL_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
// Minimal MP4 ftyp header (detected as video/mp4 by file-type)
const MINIMAL_MP4 = Buffer.concat([
    Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex'),
    Buffer.from('000000086d646174', 'hex')
]);

function createMockSock() {
    const sentMessages = [];
    const relayedMessages = [];
    let seq = 1;

    return {
        user: { id: '628000000000:1@s.whatsapp.net' },
        sentMessages,
        relayedMessages,
        updateMediaMessage: async () => {},
        async sendMessage(chatId, content, options = {}) {
            const msg = {
                key: { id: `MSG_${seq++}`, remoteJid: chatId, fromMe: true },
                chatId,
                content,
                options
            };
            sentMessages.push(msg);
            return msg;
        },
        async relayMessage(chatId, message, options = {}) {
            relayedMessages.push({ chatId, message, options });
            return options.messageId;
        }
    };
}

function createIncomingMediaMessage({ chatId, senderId, isVideo = false, mimetype, fileLength, seconds = 3 }) {
    const mediaKey = isVideo ? 'videoMessage' : 'imageMessage';
    return {
        key: {
            remoteJid: chatId,
            fromMe: false,
            id: `IN_${Math.random().toString(36).slice(2, 8)}`,
            participant: chatId.endsWith('@g.us') ? senderId : undefined
        },
        message: {
            [mediaKey]: {
                mimetype: mimetype || (isVideo ? 'video/mp4' : 'image/png'),
                caption: '.sticker',
                fileLength: fileLength ?? 1024,
                ...(isVideo ? { seconds } : {})
            }
        }
    };
}

function createInteractiveButtonReply({ chatId, senderId, buttonId, stanzaId = 'PROMPT_1' }) {
    return {
        key: {
            remoteJid: chatId,
            fromMe: false,
            id: `CB_${Math.random().toString(36).slice(2, 8)}`,
            participant: chatId.endsWith('@g.us') ? senderId : undefined
        },
        message: {
            interactiveResponseMessage: {
                body: { text: 'selected', format: 0 },
                contextInfo: { stanzaId },
                nativeFlowResponseMessage: {
                    name: 'quick_reply',
                    paramsJson: JSON.stringify({ id: buttonId }),
                    version: 3
                }
            }
        }
    };
}

function extractPromptButtonsFromRelay(relayedEntry) {
    const interactive = relayedEntry.message?.viewOnceMessage?.message?.interactiveMessage;
    const buttons = interactive?.nativeFlowMessage?.buttons || [];
    return buttons.map(b => JSON.parse(b.buttonParamsJson));
}

function makeFakeBinaryRunner({ hasVideo = true, hasAudio = true, duration = 3.5, audioCodec = 'aac', failTranscode = false, delayMs = 0 } = {}) {
    const calls = [];
    const runner = async (bin, args) => {
        calls.push({ bin, args });
        if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
        }

        if (bin === 'ffprobe') {
            const streams = [];
            if (hasVideo) {
                streams.push({ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, duration: String(duration) });
            }
            if (hasAudio) {
                streams.push({ codec_type: 'audio', codec_name: audioCodec, sample_rate: '44100', channels: 2, duration: String(duration) });
            }
            return {
                stdout: JSON.stringify({ format: { duration: String(duration) }, streams }),
                stderr: ''
            };
        }

        if (bin === 'ffmpeg') {
            const outPath = args[args.length - 1];
            if (failTranscode && outPath.endsWith('.ogg')) {
                const err = new Error('ffmpeg transcode failed');
                err.stderr = 'Unsupported codec with id';
                throw err;
            }
            if (outPath.endsWith('.webp')) {
                fs.writeFileSync(outPath, MINIMAL_WEBP);
            } else if (outPath.endsWith('.ogg')) {
                fs.writeFileSync(outPath, Buffer.from('OggS-opus-mock-data'));
            }
            return { stdout: '', stderr: '' };
        }

        throw new Error(`Unexpected binary: ${bin}`);
    };
    return { runner, calls };
}

test.afterEach(() => {
    clearAllStickerSessions();
});

test('1. Foto dikirim -> langsung menghasilkan sticker statis WebP dengan EXIF tanpa prompt tombol', async () => {
    const sock = createMockSock();
    const msg = createIncomingMediaMessage({
        chatId: '628111111111@s.whatsapp.net',
        senderId: '628111111111@s.whatsapp.net',
        isVideo: false
    });
    const { runner, calls } = makeFakeBinaryRunner();

    await stickerCommand(sock, msg.key.remoteJid, msg, {
        downloadMediaMessage: async () => MINIMAL_PNG,
        runBinary: runner
    });

    assert.equal(sock.relayedMessages.length, 0, 'Foto tidak boleh mengirim prompt tombol');
    assert.equal(sock.sentMessages.length, 1);
    const sentSticker = sock.sentMessages[0].content.sticker;
    assert.ok(Buffer.isBuffer(sentSticker));

    const img = new webp.Image();
    await img.load(sentSticker);
    assert.ok(img.exif && img.exif.length > 0, 'Sticker statis harus memiliki metadata EXIF');

    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall);
    assert.ok(ffmpegCall.args.includes('libwebp'));
});

test('2. Video tanpa audio -> pilihan Tanpa Audio berhasil menghasilkan animated sticker tanpa audio (-an)', async () => {
    const sock = createMockSock();
    const chatId = '120363000001@g.us';
    const userA = '628111111111@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: userA, isVideo: true });
    const { runner, calls } = makeFakeBinaryRunner({ hasAudio: false, duration: 4 });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    assert.equal(sock.relayedMessages.length, 1, 'Harus mengirim pesan interaktif 2 tombol');
    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    assert.equal(buttons.length, 2);
    assert.match(buttons[0].display_text, /Tanpa Audio/);
    assert.match(buttons[1].display_text, /Dengan Audio/);

    const promptId = sock.relayedMessages[0].options.messageId;
    const cbMsg = createInteractiveButtonReply({ chatId, senderId: userA, buttonId: buttons[0].id, stanzaId: promptId });

    const handled = await stickerCommand.handleStickerCallback(sock, chatId, cbMsg, { runBinary: runner });
    assert.equal(handled, true);

    const stickerMsg = sock.sentMessages.find(m => m.content.sticker);
    assert.ok(stickerMsg, 'Harus mengirim sticker WebP');

    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall.args.includes('-an'), 'Konversi tanpa audio harus memakai flag -an');
});

test('3. Video tanpa audio -> pilihan Dengan Audio ditolak dengan informasi video tidak memiliki audio', async () => {
    const sock = createMockSock();
    const chatId = '120363000002@g.us';
    const userA = '628222222222@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: userA, isVideo: true });
    const { runner } = makeFakeBinaryRunner({ hasAudio: false, duration: 3 });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const cbMsg = createInteractiveButtonReply({
        chatId,
        senderId: userA,
        buttonId: buttons[1].id,
        stanzaId: sock.relayedMessages[0].options.messageId
    });

    await stickerCommand.handleStickerCallback(sock, chatId, cbMsg, { runBinary: runner });

    const stickerMsgs = sock.sentMessages.filter(m => m.content.sticker);
    assert.equal(stickerMsgs.length, 0, 'Tidak boleh mengirim sticker jika video tidak punya audio');

    const errMsg = sock.sentMessages.find(m => /tidak memiliki audio/i.test(m.content.text || ''));
    assert.ok(errMsg, 'Harus memberi informasi bahwa video tidak memiliki audio');
});

test('4. Video dengan audio -> pilihan Tanpa Audio menghasilkan animated sticker tanpa suara', async () => {
    const sock = createMockSock();
    const chatId = '628333333333@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    const { runner, calls } = makeFakeBinaryRunner({ hasAudio: true, audioCodec: 'aac', duration: 4 });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const cbMsg = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[0].id });

    await stickerCommand.handleStickerCallback(sock, chatId, cbMsg, { runBinary: runner });

    const stickerMsg = sock.sentMessages.find(m => m.content.sticker);
    assert.ok(stickerMsg);
    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall.args.includes('-an'), 'Harus mengabaikan audio dengan -an');
});

test('5a. Verifikasi aktual Baileys WAProto -> tidak mendukung Audio Sticker native & tidak memalsukan GIF/video', async () => {
    assert.equal(isNativeAudioStickerSupported(proto), false, 'Baileys 7.0.0-rc14 WAProto belum mendukung native audio sticker');

    const sock = createMockSock();
    const chatId = '628444444444@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    const { runner } = makeFakeBinaryRunner({ hasAudio: true, audioCodec: 'aac', duration: 4 });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const cbMsg = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[1].id });

    await stickerCommand.handleStickerCallback(sock, chatId, cbMsg, { runBinary: runner });

    // Must NOT send fake video/GIF or fake sticker
    assert.equal(sock.sentMessages.filter(m => m.content.video || m.content.sticker).length, 0);
    const infoMsg = sock.sentMessages.find(m => /Belum Didukung|WAProto/i.test(m.content.text || ''));
    assert.ok(infoMsg, 'Harus menginformasikan keterbatasan protokol Baileys secara jujur');
});

test('5b. Jalur forward-compatible Audio Sticker saat WAProto mendukung audioStickerMessage -> transcoding Opus + WebP sinkron', async () => {
    const sock = createMockSock();
    const chatId = '628555555555@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    const { runner, calls } = makeFakeBinaryRunner({ hasAudio: true, audioCodec: 'mp3', duration: 5 });

    const mockFutureProto = {
        Message: {
            prototype: { audioStickerMessage: null },
            StickerMessage: { prototype: { audioMessage: null } }
        }
    };

    assert.equal(isNativeAudioStickerSupported(mockFutureProto), true);

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const cbMsg = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[1].id });

    let nativeDelivered = null;
    await stickerCommand.handleStickerCallback(sock, chatId, cbMsg, {
        runBinary: runner,
        waProto: mockFutureProto,
        sendNativeAudioSticker: async (_s, _c, audioResult) => {
            nativeDelivered = audioResult;
        }
    });

    assert.ok(nativeDelivered, 'Adapter pengiriman audio sticker harus terpanggil');
    assert.ok(Buffer.isBuffer(nativeDelivered.stickerBuffer));
    assert.ok(Buffer.isBuffer(nativeDelivered.audioBuffer));
    const opusCall = calls.find(c => c.bin === 'ffmpeg' && c.args.includes('libopus'));
    assert.ok(opusCall, 'Audio harus ditranscode ke libopus (48kHz mono)');
    assert.ok(opusCall.args.includes('48000'));
    assert.ok(opusCall.args.includes('1'));
});

test('6. Tombol diklik berulang kali (konkuren & setelah selesai) -> tidak terjadi pemrosesan ganda', async () => {
    const sock = createMockSock();
    const chatId = '628666666666@s.whatsapp.net';
    const videoMsg = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    const { runner, calls } = makeFakeBinaryRunner({ hasAudio: false, duration: 2, delayMs: 60 });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const buttons = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const cb1 = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[0].id });
    const cb2 = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[0].id });

    // Click twice concurrently
    await Promise.all([
        stickerCommand.handleStickerCallback(sock, chatId, cb1, { runBinary: runner }),
        stickerCommand.handleStickerCallback(sock, chatId, cb2, { runBinary: runner })
    ]);

    // Click a third time after completion
    const cb3 = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: buttons[0].id });
    await stickerCommand.handleStickerCallback(sock, chatId, cb3, { runBinary: runner });

    const stickerMsgs = sock.sentMessages.filter(m => m.content.sticker);
    assert.equal(stickerMsgs.length, 1, 'Sticker hanya boleh diproses dan dikirim tepat 1 kali');
    assert.equal(calls.filter(c => c.bin === 'ffmpeg').length, 1, 'FFmpeg hanya boleh berjalan 1 kali');

    assert.ok(sock.sentMessages.some(m => /sedang dalam proses/i.test(m.content.text || '')));
    assert.ok(sock.sentMessages.some(m => /sudah diproses/i.test(m.content.text || '')));
});

test('7. Dua pengguna mengirim video bersamaan & satu pengguna mengirim 2 video -> konteks tidak tertukar dan terotorisasi', async () => {
    const sock = createMockSock();
    const groupId = '120363000099@g.us';
    const userA = '628111000111:2@s.whatsapp.net';
    const userB = '628222000222@s.whatsapp.net';

    const { runner } = makeFakeBinaryRunner({ hasAudio: false, duration: 2 });

    // User A sends Video 1, User B sends Video 2, User A sends Video 3 before choosing Video 1
    const msgA1 = createIncomingMediaMessage({ chatId: groupId, senderId: userA, isVideo: true });
    const msgB1 = createIncomingMediaMessage({ chatId: groupId, senderId: userB, isVideo: true });
    const msgA2 = createIncomingMediaMessage({ chatId: groupId, senderId: userA, isVideo: true });

    await Promise.all([
        stickerCommand(sock, groupId, msgA1, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false }),
        stickerCommand(sock, groupId, msgB1, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false }),
        stickerCommand(sock, groupId, msgA2, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false })
    ]);

    assert.equal(sock.relayedMessages.length, 3);
    const btnsA1 = extractPromptButtonsFromRelay(sock.relayedMessages[0]);
    const btnsB1 = extractPromptButtonsFromRelay(sock.relayedMessages[1]);
    const btnsA2 = extractPromptButtonsFromRelay(sock.relayedMessages[2]);

    // User B tries to click User A's button -> MUST be rejected without consuming User A's session
    const unauthorizedClick = createInteractiveButtonReply({ chatId: groupId, senderId: userB, buttonId: btnsA1[0].id });
    await stickerCommand.handleStickerCallback(sock, groupId, unauthorizedClick, { runBinary: runner });
    assert.ok(sock.sentMessages.some(m => /Hanya pengirim video/i.test(m.content.text || '')));

    // User A (even from normalized JID without :2) clicks Video 1 -> MUST quote msgA1
    const clickA1 = createInteractiveButtonReply({ chatId: groupId, senderId: '628111000111@s.whatsapp.net', buttonId: btnsA1[0].id });
    await stickerCommand.handleStickerCallback(sock, groupId, clickA1, { runBinary: runner });

    // User A clicks Video 3 via quoted reply "1" -> MUST quote msgA2
    const promptIdA2 = sock.relayedMessages[2].options.messageId;
    const replyA2 = {
        key: { remoteJid: groupId, fromMe: false, id: 'RPL_A2', participant: '628111000111@s.whatsapp.net' },
        message: { extendedTextMessage: { text: '1', contextInfo: { stanzaId: promptIdA2 } } }
    };
    await stickerCommand.handleStickerCallback(sock, groupId, replyA2, { runBinary: runner });

    // User B clicks User B's button -> MUST quote msgB1
    const clickB1 = createInteractiveButtonReply({ chatId: groupId, senderId: userB, buttonId: btnsB1[0].id });
    await stickerCommand.handleStickerCallback(sock, groupId, clickB1, { runBinary: runner });

    const stickers = sock.sentMessages.filter(m => m.content.sticker);
    assert.equal(stickers.length, 3);
    assert.equal(stickers[0].options.quoted.key.id, msgA1.key.id);
    assert.equal(stickers[1].options.quoted.key.id, msgA2.key.id);
    assert.equal(stickers[2].options.quoted.key.id, msgB1.key.id);
});

test('8. Error handling: file besar, format invalid, durasi berlebih, transcode gagal, expiry tidak memilih tombol, & gagal kirim', async () => {
    const sock = createMockSock();
    const chatId = '628888888888@s.whatsapp.net';

    // 8a. Ukuran melebihi batas (>20MB)
    const oversizedMsg = createIncomingMediaMessage({
        chatId,
        senderId: chatId,
        isVideo: true,
        fileLength: MAX_VIDEO_INPUT_BYTES + 1024
    });
    await stickerCommand(sock, chatId, oversizedMsg, { downloadMediaMessage: async () => MINIMAL_MP4 });
    assert.match(sock.sentMessages.at(-1).content.text, /melebihi batas maksimal/i);

    // 8b. Format file tidak valid (mis. plain text)
    const invalidFormat = await classifyAndValidateMedia({ mimetype: 'application/pdf' }, Buffer.from('%PDF-1.4 test'));
    assert.equal(invalidFormat.kind, 'unsupported');

    // 8c. Durasi audio sticker melebihi batas (> 10s)
    const tmpVid = path.join(process.cwd(), 'tmp', `test_dur_${Date.now()}.mp4`);
    fs.mkdirSync(path.dirname(tmpVid), { recursive: true });
    fs.writeFileSync(tmpVid, MINIMAL_MP4);
    try {
        const { runner: longRunner } = makeFakeBinaryRunner({ hasAudio: true, duration: 25 });
        const durRes = await processAudioStickerPipeline(tmpVid, { runBinary: longRunner });
        assert.equal(durRes.ok, false);
        assert.equal(durRes.code, 'DURATION_EXCEEDED');

        // 8d. Transcoding audio gagal / codec tidak didukung
        const { runner: failRunner } = makeFakeBinaryRunner({ hasAudio: true, duration: 4, failTranscode: true });
        const mockFutureProto = { Message: { prototype: { audioStickerMessage: null }, StickerMessage: { prototype: {} } } };
        const transRes = await processAudioStickerPipeline(tmpVid, { runBinary: failRunner, waProto: mockFutureProto });
        assert.equal(transRes.ok, false);
        assert.equal(transRes.code, 'UNSUPPORTED_AUDIO_FORMAT');
    } finally {
        try { fs.unlinkSync(tmpVid); } catch {}
    }

    // 8e. Pengguna tidak memilih tombol -> timeout TTL membersihkan file & callback berikutnya ditolak kedaluwarsa
    const sockExp = createMockSock();
    const msgExp = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    await stickerCommand(sockExp, chatId, msgExp, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        ttlMs: 30,
        notifyOnExpire: true
    });
    const btnsExp = extractPromptButtonsFromRelay(sockExp.relayedMessages[0]);
    await new Promise(r => setTimeout(r, 80));

    assert.ok(sockExp.sentMessages.some(m => /habis karena tidak ada tombol yang dipilih/i.test(m.content.text || '')));
    const lateClick = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: btnsExp[0].id });
    await stickerCommand.handleStickerCallback(sockExp, chatId, lateClick);
    assert.ok(sockExp.sentMessages.some(m => /kedaluwarsa/i.test(m.content.text || '')));

    // 8f. Pengiriman sticker gagal -> ditangani informatif tanpa crash
    const failingSock = createMockSock();
    const origSend = failingSock.sendMessage.bind(failingSock);
    failingSock.sendMessage = async (jid, content, opts) => {
        if (content.sticker) throw new Error('Network upload timeout');
        return origSend(jid, content, opts);
    };
    const { runner: okRunner } = makeFakeBinaryRunner({ hasAudio: false, duration: 2 });
    const msgFailSend = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    await stickerCommand(failingSock, chatId, msgFailSend, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: okRunner,
        notifyOnExpire: false
    });
    const btnsFail = extractPromptButtonsFromRelay(failingSock.relayedMessages[0]);
    const cbFail = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: btnsFail[0].id });
    await stickerCommand.handleStickerCallback(failingSock, chatId, cbFail, { runBinary: okRunner });
    assert.ok(failingSock.sentMessages.some(m => /gagal dikirim/i.test(m.content.text || '')));
});

test('9. Fallback ffmpeg -i parsing & router main.js mengenali callback tombol sticker tanpa prefix titik', async () => {
    const parsedWithAudio = parseFfmpegInspectOutput(
        'Duration: 00:00:05.20, start: 0.000000\nStream #0:0(und): Video: h264\nStream #0:1(und): Audio: aac, 44100 Hz, stereo'
    );
    assert.equal(parsedWithAudio.valid, true);
    assert.equal(parsedWithAudio.hasAudio, true);
    assert.equal(parsedWithAudio.audioCodec, 'aac');
    assert.equal(parsedWithAudio.duration, 5.2);

    const parsedNoAudio = parseFfmpegInspectOutput(
        'Duration: 00:00:02.00\nStream #0:0: Video: vp9'
    );
    assert.equal(parsedNoAudio.valid, true);
    assert.equal(parsedNoAudio.hasAudio, false);

    // Ensure main.js routes interactiveResponseMessage callback properly
    const sock = createMockSock();
    const chatId = '628999999999@s.whatsapp.net';
    const cb = createInteractiveButtonReply({ chatId, senderId: chatId, buttonId: 'stk_opt:no_audio:deadbeef1234' });
    await handleMessages(sock, { messages: [cb], type: 'notify' }, false);
    assert.ok(sock.sentMessages.some(m => /kedaluwarsa|tidak ditemukan/i.test(m.content.text || '')));

    const parsedCb = parseStickerCallback(cb);
    assert.deepEqual(parsedCb, {
        choice: 'no_audio',
        requestId: 'deadbeef1234',
        source: 'interactive_button',
        promptMessageId: 'PROMPT_1'
    });
});

after(() => {
    setTimeout(() => process.exit(0), 100);
});
