const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');

const stickerCommand = require('../commands/sticker');
const {
    MAX_VIDEO_INPUT_BYTES,
    MAX_AUDIO_STICKER_DURATION_SEC,
    classifyAndValidateMedia,
    parseFfmpegInspectOutput
} = require('../lib/stickerMedia');
const {
    clearAllStickerSessions,
    parseStickerCallback
} = require('../lib/stickerSession');
const { handleMessages } = require('../main');

const MINIMAL_WEBP = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=', 'base64');
const MINIMAL_PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
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
        getMediaHost: () => 'media.example.whatsapp.net',
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

function createIncomingMediaMessage({ chatId, senderId, isVideo = false, mimetype, fileLength, seconds = 3, caption = '.sticker' }) {
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
                caption,
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

function createTextReply({ chatId, senderId, text, stanzaId }) {
    return {
        key: {
            remoteJid: chatId,
            fromMe: false,
            id: `TR_${Math.random().toString(36).slice(2, 8)}`,
            participant: chatId.endsWith('@g.us') ? senderId : undefined
        },
        message: {
            extendedTextMessage: {
                text,
                contextInfo: { stanzaId, quotedMessage: { conversation: '🎬 *Pilihan Konversi Video Sticker*' } }
            }
        }
    };
}

function findPromptMessage(sock) {
    return sock.sentMessages.find(m => typeof m.content?.text === 'string' && m.content.text.includes('Pilihan Konversi'));
}

function promptIdOf(prompt) {
    return prompt?.key?.id || prompt?.options?.messageId;
}

function makeFakeBinaryRunner({ hasVideo = true, hasAudio = true, duration = 3.5, audioCodec = 'aac', failTranscode = false, delayMs = 0 } = {}) {
    const calls = [];
    const runner = async (bin, args) => {
        calls.push({ bin, args });
        if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

        if (bin === 'ffprobe') {
            const streams = [];
            if (hasVideo) streams.push({ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280, duration: String(duration) });
            if (hasAudio) streams.push({ codec_type: 'audio', codec_name: audioCodec, sample_rate: '44100', channels: 2, duration: String(duration) });
            return { stdout: JSON.stringify({ format: { duration: String(duration) }, streams }), stderr: '' };
        }

        if (bin === 'ffmpeg') {
            const outPath = args[args.length - 1];
            if (failTranscode && outPath.endsWith('.ogg')) {
                const err = new Error('ffmpeg transcode failed');
                err.stderr = 'Unsupported codec with id';
                throw err;
            }
            if (outPath.endsWith('.webp')) fs.writeFileSync(outPath, MINIMAL_WEBP);
            if (outPath.endsWith('.ogg')) fs.writeFileSync(outPath, Buffer.from('OggS-opus-mock-data'));
            return { stdout: '', stderr: '' };
        }

        throw new Error(`Unexpected binary: ${bin}`);
    };
    return { runner, calls };
}

function createMockSoundSticker({ downloadImpl, sendImpl } = {}) {
    const calls = { download: [], send: [] };
    return {
        calls,
        async downloadVideoForSoundSticker(message, options) {
            calls.download.push({ message, options });
            if (downloadImpl) return downloadImpl(message, options);
            return MINIMAL_MP4;
        },
        async sendVideoAsSoundSticker(sock, jid, video, options) {
            calls.send.push({ sock, jid, video, options });
            if (sendImpl) return sendImpl(sock, jid, video, options);
            sock.relayedMessages.push({ chatId: jid, message: { audioStickerMessage: {} }, options });
            return { key: { id: `SS_${calls.send.length}` } };
        }
    };
}

async function setupVideoChoice({ hasAudio, duration, chatId = '120363000001@g.us', senderId = '628111111111@s.whatsapp.net' }) {
    const sock = createMockSock();
    const videoMsg = createIncomingMediaMessage({ chatId, senderId, isVideo: true });
    const { runner, calls } = makeFakeBinaryRunner({ hasAudio, duration });

    await stickerCommand(sock, chatId, videoMsg, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        runBinary: runner,
        notifyOnExpire: false
    });

    const prompt = findPromptMessage(sock);
    assert.ok(prompt, 'Harus mengirim pesan teks pilihan 1/2');
    return { sock, videoMsg, prompt, promptId: promptIdOf(prompt) || 'PROMPT_1', runner, calls };
}

test.afterEach(() => {
    clearAllStickerSessions();
});

test('1. Foto dikirim -> langsung menghasilkan sticker statis WebP dengan EXIF', async () => {
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

    assert.equal(sock.relayedMessages.length, 0);
    assert.equal(sock.sentMessages.length, 1);
    const sentSticker = sock.sentMessages[0].content.sticker;
    assert.ok(Buffer.isBuffer(sentSticker));

    const img = new webp.Image();
    await img.load(sentSticker);
    assert.ok(img.exif && img.exif.length > 0);

    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall);
    assert.ok(ffmpegCall.args.includes('libwebp'));
});

test('2. Video tanpa audio -> pilihan Tanpa Audio menghasilkan animated sticker tanpa audio (-an)', async () => {
    const { sock, videoMsg, promptId, runner, calls } = await setupVideoChoice({ hasAudio: false, duration: 4 });

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '1', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner });

    const stickerMsg = sock.sentMessages.find(m => m.content.sticker);
    assert.ok(stickerMsg);
    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall.args.includes('-an'));
});

test('3. Video tanpa audio -> pilihan Dengan Audio ditolak dengan informasi video tidak memiliki audio', async () => {
    const { sock, videoMsg, promptId, runner } = await setupVideoChoice({ hasAudio: false, duration: 3 });

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '2', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner });

    assert.equal(sock.sentMessages.filter(m => m.content.sticker || m.content.audioStickerMessage).length, 0);
    assert.ok(sock.sentMessages.some(m => /tidak memiliki audio/i.test(m.content.text || '')));
});

test('4. Video dengan audio -> pilihan Tanpa Audio menghasilkan animated sticker tanpa suara', async () => {
    const { sock, videoMsg, promptId, runner, calls } = await setupVideoChoice({ hasAudio: true, duration: 4 });

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '1', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner });

    const stickerMsg = sock.sentMessages.find(m => m.content.sticker);
    assert.ok(stickerMsg);
    const ffmpegCall = calls.find(c => c.bin === 'ffmpeg');
    assert.ok(ffmpegCall.args.includes('-an'));
});

test('5. Video <=5 detik -> Audio Sticker valid diproses oleh library', async () => {
    const { sock, videoMsg, promptId, runner } = await setupVideoChoice({ hasAudio: true, duration: 5 });
    const sound = createMockSoundSticker();

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '2', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner, soundSticker: sound });

    assert.equal(sound.calls.download.length, 1);
    assert.equal(sound.calls.send.length, 1);
    assert.ok(sound.calls.send[0].video.length > 0);
    assert.equal(sock.relayedMessages.length, 1);
});

test('6. Video >5 detik -> Audio Sticker ditolak sebelum download/library', async () => {
    const { sock, videoMsg, promptId, runner } = await setupVideoChoice({ hasAudio: true, duration: 6 });
    const sound = createMockSoundSticker();

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '2', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner, soundSticker: sound });

    assert.equal(sound.calls.download.length, 0);
    assert.equal(sound.calls.send.length, 0);
    assert.ok(sock.sentMessages.some(m => /melebihi batas maksimal Audio Sticker/i.test(m.content.text || '')));
});

test('7. Pilihan diklik berulang kali -> tidak terjadi pemrosesan ganda', async () => {
    const { sock, videoMsg, promptId, runner, calls } = await setupVideoChoice({ hasAudio: false, duration: 2 });

    const cb1 = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '1', stanzaId: promptId });
    const cb2 = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '1', stanzaId: promptId });

    await Promise.all([
        stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cb1, { runBinary: runner }),
        stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cb2, { runBinary: runner })
    ]);

    const cb3 = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '1', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cb3, { runBinary: runner });

    assert.equal(sock.sentMessages.filter(m => m.content.sticker).length, 1);
    assert.equal(calls.filter(c => c.bin === 'ffmpeg').length, 1);
    assert.ok(sock.sentMessages.some(m => /sedang dalam proses/i.test(m.content.text || '')));
    assert.ok(sock.sentMessages.some(m => /sudah diproses/i.test(m.content.text || '')));
});

test('8. Dua pengguna mengirim video bersamaan -> konteks dan otorisasi tidak tertukar', async () => {
    const sock = createMockSock();
    const groupId = '120363000099@g.us';
    const userA = '628111000111:2@s.whatsapp.net';
    const userB = '628222000222@s.whatsapp.net';
    const { runner } = makeFakeBinaryRunner({ hasAudio: false, duration: 2 });

    const msgA1 = createIncomingMediaMessage({ chatId: groupId, senderId: userA, isVideo: true });
    const msgB1 = createIncomingMediaMessage({ chatId: groupId, senderId: userB, isVideo: true });
    const msgA2 = createIncomingMediaMessage({ chatId: groupId, senderId: userA, isVideo: true });

    await Promise.all([
        stickerCommand(sock, groupId, msgA1, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false }),
        stickerCommand(sock, groupId, msgB1, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false }),
        stickerCommand(sock, groupId, msgA2, { downloadMediaMessage: async () => MINIMAL_MP4, runBinary: runner, notifyOnExpire: false })
    ]);

    const prompts = sock.sentMessages.filter(m => typeof m.content?.text === 'string' && m.content.text.includes('Pilihan Konversi'));
    assert.equal(prompts.length, 3);
    const [promptA1, promptB1, promptA2] = prompts;

    const unauthorized = createTextReply({ chatId: groupId, senderId: userB, text: '1', stanzaId: promptIdOf(promptA1) });
    await stickerCommand.handleStickerCallback(sock, groupId, unauthorized, { runBinary: runner });
    assert.ok(sock.sentMessages.some(m => /Hanya pengirim video/i.test(m.content.text || '')));

    const clickA1 = createTextReply({ chatId: groupId, senderId: '628111000111@s.whatsapp.net', text: '1', stanzaId: promptIdOf(promptA1) });
    await stickerCommand.handleStickerCallback(sock, groupId, clickA1, { runBinary: runner });

    const replyA2 = createTextReply({ chatId: groupId, senderId: '628111000111@s.whatsapp.net', text: '1', stanzaId: promptIdOf(promptA2) });
    await stickerCommand.handleStickerCallback(sock, groupId, replyA2, { runBinary: runner });

    const clickB1 = createTextReply({ chatId: groupId, senderId: userB, text: '1', stanzaId: promptIdOf(promptB1) });
    await stickerCommand.handleStickerCallback(sock, groupId, clickB1, { runBinary: runner });

    const stickers = sock.sentMessages.filter(m => m.content.sticker);
    assert.equal(stickers.length, 3);
    assert.equal(stickers[0].options.quoted.key.id, msgA1.key.id);
    assert.equal(stickers[1].options.quoted.key.id, msgA2.key.id);
    assert.equal(stickers[2].options.quoted.key.id, msgB1.key.id);
});

test('9. Error handling: file besar, format invalid, timeout, download gagal, dan gagal kirim', async () => {
    const sock = createMockSock();
    const chatId = '628888888888@s.whatsapp.net';

    const oversizedMsg = createIncomingMediaMessage({
        chatId,
        senderId: chatId,
        isVideo: true,
        fileLength: MAX_VIDEO_INPUT_BYTES + 1024
    });
    await stickerCommand(sock, chatId, oversizedMsg, { downloadMediaMessage: async () => MINIMAL_MP4 });
    assert.match(sock.sentMessages.at(-1).content.text, /melebihi batas maksimal/i);

    const invalidFormat = await classifyAndValidateMedia({ mimetype: 'application/pdf' }, Buffer.from('%PDF-1.4 test'));
    assert.equal(invalidFormat.kind, 'unsupported');

    const sockExp = createMockSock();
    const msgExp = createIncomingMediaMessage({ chatId, senderId: chatId, isVideo: true });
    await stickerCommand(sockExp, chatId, msgExp, {
        downloadMediaMessage: async () => MINIMAL_MP4,
        ttlMs: 30,
        notifyOnExpire: true
    });
    const promptExp = findPromptMessage(sockExp);
    assert.ok(promptExp);
    await new Promise(r => setTimeout(r, 80));
    assert.ok(sockExp.sentMessages.some(m => /habis karena tidak ada tombol yang dipilih/i.test(m.content.text || '')));

    const lateClick = createTextReply({ chatId, senderId: chatId, text: '1', stanzaId: promptIdOf(promptExp) });
    await stickerCommand.handleStickerCallback(sockExp, chatId, lateClick);
    assert.ok(sockExp.sentMessages.some(m => /kedaluwarsa/i.test(m.content.text || '')));

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
    const promptFail = findPromptMessage(failingSock);
    assert.ok(promptFail);
    const cbFail = createTextReply({ chatId, senderId: chatId, text: '1', stanzaId: promptIdOf(promptFail) });
    await stickerCommand.handleStickerCallback(failingSock, chatId, cbFail, { runBinary: okRunner });
    assert.ok(failingSock.sentMessages.some(m => /gagal dikirim/i.test(m.content.text || '')));
});

test('10. downloadVideoForSoundSticker dipanggil dengan pesan sumber video dan opsi mediaHost', async () => {
    const { sock, videoMsg, promptId, runner } = await setupVideoChoice({ hasAudio: true, duration: 4 });
    const sound = createMockSoundSticker();

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '2', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner, soundSticker: sound });

    assert.equal(sound.calls.download.length, 1);
    assert.equal(sound.calls.download[0].message.key.id, videoMsg.key.id);
    assert.equal(sound.calls.download[0].options.mediaHost, 'media.example.whatsapp.net');
});

test('11. sendVideoAsSoundSticker dipanggil dengan video buffer dan quoted pesan asli', async () => {
    const { sock, videoMsg, promptId, runner } = await setupVideoChoice({ hasAudio: true, duration: 4 });
    const sound = createMockSoundSticker();

    const cbMsg = createTextReply({ chatId: videoMsg.key.remoteJid, senderId: videoMsg.key.participant, text: '2', stanzaId: promptId });
    await stickerCommand.handleStickerCallback(sock, videoMsg.key.remoteJid, cbMsg, { runBinary: runner, soundSticker: sound });

    assert.equal(sound.calls.send.length, 1);
    assert.equal(sound.calls.send[0].jid, videoMsg.key.remoteJid);
    assert.ok(Buffer.isBuffer(sound.calls.send[0].video));
    assert.equal(sound.calls.send[0].options.quoted.key.id, videoMsg.key.id);
    assert.equal(sock.relayedMessages.length, 1);
});

test('12. Patch FPS sound-sticker library 12 -> 24 hanya mengubah konfigurasi FPS', () => {
    const lib = fs.readFileSync('node_modules/@xbibzlibrary/whatsbibz/lib/Utils/sound-sticker.js', 'utf8');
    assert.match(lib, /for \(const \[fps, quality\] of \[\[24, 70\], \[24, 55\], \[10, 42\], \[8, 30\], \[6, 20\]\]\)/);
    assert.doesNotMatch(lib, /for \(const \[fps, quality\] of \[\[12, 70\], \[12, 55\]/);
    assert.match(lib, /buffer\.toString\('ascii', 8, 12\)/);
});

test('13. Patch persist: script postinstall mengandung patch FPS dan audioStickerMessage', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    assert.match(pkg.scripts.postinstall, /patch-node-modules/);

    const patch = fs.readFileSync('scripts/patch-node-modules.js', 'utf8');
    assert.match(patch, /\[24, 70\], \[24, 55\]/);
    assert.match(patch, /audioStickerMessage = 134/);
    assert.match(patch, /Message\.prototype\.audioStickerMessage/);

    const baileys = fs.readFileSync('node_modules/@whiskeysockets/baileys/WAProto/index.js', 'utf8');
    assert.match(baileys, /Message\.prototype\.audioStickerMessage = null/);
    assert.match(baileys, /case 134:/);
    assert.match(baileys, /StickerMessage\.prototype\.audioMessage = null/);
    assert.match(baileys, /case 26:/);
});

test('14. Fallback ffmpeg -i parsing & router main.js mengenali callback sticker tanpa prefix titik', async () => {
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

test('15. Konstanta durasi Audio Sticker adalah 5 detik', () => {
    assert.equal(MAX_AUDIO_STICKER_DURATION_SEC, 5);
});

test('16. WAProto round-trip mempertahankan audioStickerMessage dan stickerMessage.audioMessage', async () => {
    const { proto } = await import('../node_modules/@whiskeysockets/baileys/WAProto/index.js');
    const content = {
        audioStickerMessage: {
            message: {
                stickerMessage: {
                    url: 'https://sticker.example',
                    audioMessage: { url: 'https://audio.example', mimetype: 'audio/ogg; codecs=opus', seconds: 5 }
                }
            }
        }
    };
    const encoded = proto.Message.encode(proto.Message.fromObject(content)).finish();
    const decoded = proto.Message.decode(encoded);

    assert.ok(decoded.audioStickerMessage);
    assert.equal(decoded.audioStickerMessage.message.stickerMessage.url, 'https://sticker.example');
    assert.equal(decoded.audioStickerMessage.message.stickerMessage.audioMessage.url, 'https://audio.example');
});

test.after(() => {
    // main.js imports modules with open handles; force a clean test exit.
    setTimeout(() => process.exit(0), 100);
});