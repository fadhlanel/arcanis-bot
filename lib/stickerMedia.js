const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const FileType = require('file-type');
const webp = require('node-webpmux');
const settings = require('../settings');

const MAX_VIDEO_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB batas upload video input
const MAX_STICKER_OUTPUT_BYTES = 1000 * 1024; // ~1 MB batas aman animated WebP WhatsApp
const MAX_AUDIO_STICKER_DURATION_SEC = 5; // Batas durasi Audio Sticker WhatsApp (detik)
const FFMPEG_TIMEOUT_MS = 60 * 1000;

const SUPPORTED_VIDEO_MIMES = new Set([
    'video/mp4',
    'video/quicktime',
    'video/3gpp',
    'video/webm',
    'video/x-matroska',
    'video/x-msvideo',
    'video/avi',
    'video/mpeg',
    'video/ogg',
    'image/gif'
]);

const SUPPORTED_IMAGE_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);

/**
 * Ensures and returns the project temporary directory path.
 * @returns {string}
 */
function ensureTmpDir() {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }
    return tmpDir;
}

/**
 * Creates a safe error object with a machine-readable `code`.
 * @param {string} code
 * @param {string} message
 * @returns {Error}
 */
function createStickerError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

/**
 * Runs an external binary safely via `execFile` without shell interpolation.
 * @param {string} bin
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function runBinary(bin, args, timeoutMs = FFMPEG_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                error.stdout = stdout;
                error.stderr = stderr;
                return reject(error);
            }
            resolve({ stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

/**
 * Injects WhatsApp Sticker EXIF metadata into a WebP buffer.
 * @param {Buffer} webpBuffer
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
async function addStickerExif(webpBuffer, opts = {}) {
    const img = new webp.Image();
    await img.load(webpBuffer);

    const json = {
        'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
        'sticker-pack-name': opts.packname || settings.packname || 'BotGajeJir',
        'emojis': Array.isArray(opts.emojis) && opts.emojis.length > 0 ? opts.emojis : ['🤖']
    };
    if (opts.author || settings.author) {
        json['sticker-pack-publisher'] = opts.author || settings.author;
    }

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    img.exif = exif;
    return await img.save(null);
}

/**
 * Classifies and validates an incoming media buffer as static image, video/animation, or unsupported.
 * @param {object} mediaMessage
 * @param {Buffer} mediaBuffer
 * @returns {Promise<{ kind: 'image'|'video'|'unsupported', mimetype: string, ext: string, reason?: string }>}
 */
async function classifyAndValidateMedia(mediaMessage, mediaBuffer) {
    if (!Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
        return { kind: 'unsupported', mimetype: '', ext: '', reason: 'File media kosong atau gagal diunduh.' };
    }

    const detected = await FileType.fromBuffer(mediaBuffer).catch(() => null);
    const declaredMime = String(mediaMessage?.mimetype || '').split(';')[0].trim().toLowerCase();
    const effectiveMime = (detected?.mime || declaredMime || '').toLowerCase();
    const effectiveExt = detected?.ext || (effectiveMime.includes('gif') ? 'gif' : effectiveMime.startsWith('video/') ? 'mp4' : 'bin');

    const isAnimatedHint =
        declaredMime.includes('gif') ||
        declaredMime.includes('video') ||
        Boolean(mediaMessage?.gifPlayback) ||
        Number(mediaMessage?.seconds) > 0;

    if (SUPPORTED_VIDEO_MIMES.has(effectiveMime) || effectiveMime.startsWith('video/')) {
        if (mediaBuffer.length > MAX_VIDEO_INPUT_BYTES) {
            return {
                kind: 'unsupported',
                mimetype: effectiveMime,
                ext: effectiveExt,
                reason: `Ukuran video (${(mediaBuffer.length / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal ${MAX_VIDEO_INPUT_BYTES / (1024 * 1024)} MB.`
            };
        }
        return { kind: 'video', mimetype: effectiveMime, ext: effectiveExt };
    }

    if (SUPPORTED_IMAGE_MIMES.has(effectiveMime) || (!isAnimatedHint && effectiveMime.startsWith('image/'))) {
        return { kind: 'image', mimetype: effectiveMime, ext: detected?.ext || 'jpg' };
    }

    // Fallback when magic bytes didn't match known container but message explicitly declared video/image
    if (isAnimatedHint && !detected) {
        if (mediaBuffer.length > MAX_VIDEO_INPUT_BYTES) {
            return {
                kind: 'unsupported',
                mimetype: declaredMime,
                ext: 'mp4',
                reason: `Ukuran video (${(mediaBuffer.length / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal ${MAX_VIDEO_INPUT_BYTES / (1024 * 1024)} MB.`
            };
        }
        return { kind: 'video', mimetype: declaredMime || 'video/mp4', ext: 'mp4' };
    }

    return {
        kind: 'unsupported',
        mimetype: effectiveMime || declaredMime,
        ext: effectiveExt,
        reason: `Format file (${effectiveMime || 'tidak dikenal'}) tidak didukung untuk dibuat menjadi sticker.`
    };
}

/**
 * Converts a static image buffer into a WhatsApp sticker WebP buffer with EXIF metadata.
 * Preserves existing static sticker output behavior.
 * @param {Buffer} imageBuffer
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
async function convertImageBufferToSticker(imageBuffer, opts = {}) {
    const tmpDir = ensureTmpDir();
    const id = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempInput = path.join(tmpDir, `img_in_${id}`);
    const tempOutput = path.join(tmpDir, `img_out_${id}.webp`);
    const execBin = opts.runBinary || runBinary;

    try {
        fs.writeFileSync(tempInput, imageBuffer);
        await execBin('ffmpeg', [
            '-y',
            '-i', tempInput,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
            '-c:v', 'libwebp',
            '-preset', 'default',
            '-loop', '0',
            '-vsync', '0',
            '-pix_fmt', 'yuva420p',
            '-quality', '75',
            '-compression_level', '6',
            tempOutput
        ]);

        if (!fs.existsSync(tempOutput) || fs.statSync(tempOutput).size === 0) {
            throw createStickerError('TRANSCODE_FAILED', 'FFmpeg gagal menghasilkan file WebP dari gambar.');
        }

        const webpBuffer = fs.readFileSync(tempOutput);
        return await addStickerExif(webpBuffer, opts);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw createStickerError('FFMPEG_MISSING', 'FFmpeg tidak ditemukan di server.');
        }
        throw err;
    } finally {
        try { if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput); } catch {}
        try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch {}
    }
}

/**
 * Converts a video file into an animated WhatsApp WebP sticker WITHOUT audio (`-an`).
 * Preserves existing quality tiers and size-reduction fallbacks.
 * @param {string} inputPath
 * @param {object} [opts]
 * @returns {Promise<Buffer>}
 */
async function convertVideoFileToAnimatedSticker(inputPath, opts = {}) {
    if (!inputPath || !fs.existsSync(inputPath)) {
        throw createStickerError('INVALID_VIDEO', 'File video sumber tidak ditemukan.');
    }

    const tmpDir = ensureTmpDir();
    const id = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempOutput1 = path.join(tmpDir, `vid_out1_${id}.webp`);
    const tempOutput2 = path.join(tmpDir, `vid_out2_${id}.webp`);
    const tempOutput3 = path.join(tmpDir, `vid_out3_${id}.webp`);
    const execBin = opts.runBinary || runBinary;
    const maxDuration = opts.durationLimitSec ? String(opts.durationLimitSec) : null;

    const cleanup = () => {
        for (const p of [tempOutput1, tempOutput2, tempOutput3]) {
            try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
        }
    };

    try {
        const inputSizeKB = fs.statSync(inputPath).size / 1024;
        const pass1Args = [
            '-y',
            '-i', inputPath,
            ...(maxDuration ? ['-t', maxDuration] : []),
            '-an',
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
            '-c:v', 'libwebp',
            '-preset', 'default',
            '-loop', '0',
            '-vsync', '0',
            '-pix_fmt', 'yuva420p',
            '-quality', '75',
            '-compression_level', '6',
            tempOutput1
        ];

        await execBin('ffmpeg', pass1Args);

        if (!fs.existsSync(tempOutput1) || fs.statSync(tempOutput1).size === 0) {
            throw createStickerError('TRANSCODE_FAILED', 'FFmpeg gagal mengonversi video menjadi animated sticker.');
        }

        let webpBuffer = fs.readFileSync(tempOutput1);

        // Pass 2: if output > ~1MB, re-encode with lower fps/bitrate
        if (webpBuffer.length > MAX_STICKER_OUTPUT_BYTES) {
            const isLargeFile = inputSizeKB > 5000;
            const pass2Duration = opts.durationLimitSec
                ? String(Math.min(opts.durationLimitSec, isLargeFile ? 2 : 3))
                : (isLargeFile ? '2' : '3');
            const pass2Args = isLargeFile
                ? [
                    '-y', '-i', inputPath, '-t', pass2Duration, '-an',
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=8,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                    '-c:v', 'libwebp', '-preset', 'default', '-loop', '0', '-vsync', '0',
                    '-pix_fmt', 'yuva420p', '-quality', '30', '-compression_level', '6',
                    '-b:v', '100k', '-max_muxing_queue_size', '1024', tempOutput2
                ]
                : [
                    '-y', '-i', inputPath, '-t', pass2Duration, '-an',
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                    '-c:v', 'libwebp', '-preset', 'default', '-loop', '0', '-vsync', '0',
                    '-pix_fmt', 'yuva420p', '-quality', '45', '-compression_level', '6',
                    '-b:v', '150k', '-max_muxing_queue_size', '1024', tempOutput2
                ];

            try {
                await execBin('ffmpeg', pass2Args);
                if (fs.existsSync(tempOutput2) && fs.statSync(tempOutput2).size > 0) {
                    webpBuffer = fs.readFileSync(tempOutput2);
                }
            } catch {}
        }

        let finalBuffer = await addStickerExif(webpBuffer, opts);

        // Pass 3: safety fallback at 320x320 if still > 900KB
        if (finalBuffer.length > 900 * 1024) {
            try {
                const pass3Duration = opts.durationLimitSec ? String(Math.min(opts.durationLimitSec, 2)) : '2';
                await execBin('ffmpeg', [
                    '-y', '-i', inputPath, '-t', pass3Duration, '-an',
                    '-vf', 'scale=320:320:force_original_aspect_ratio=decrease,fps=8,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                    '-c:v', 'libwebp', '-preset', 'default', '-loop', '0', '-vsync', '0',
                    '-pix_fmt', 'yuva420p', '-quality', '30', '-compression_level', '6',
                    '-b:v', '80k', '-max_muxing_queue_size', '1024', tempOutput3
                ]);
                if (fs.existsSync(tempOutput3) && fs.statSync(tempOutput3).size > 0) {
                    finalBuffer = await addStickerExif(fs.readFileSync(tempOutput3), opts);
                }
            } catch {}
        }

        if (finalBuffer.length > MAX_STICKER_OUTPUT_BYTES) {
            throw createStickerError(
                'SIZE_EXCEEDED',
                `Ukuran hasil sticker (${Math.round(finalBuffer.length / 1024)} KB) masih melebihi batas WhatsApp (1000 KB). Gunakan video yang lebih pendek.`
            );
        }

        return finalBuffer;
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw createStickerError('FFMPEG_MISSING', 'FFmpeg tidak ditemukan di server.');
        }
        throw err;
    } finally {
        cleanup();
    }
}

/**
 * Parses `ffmpeg -i` stderr text as a fallback when `ffprobe` is not installed.
 * @param {string} stderr
 * @returns {object}
 */
function parseFfmpegInspectOutput(stderr) {
    const text = String(stderr || '');
    if (/Invalid data found|No such file|moov atom not found|could not find codec/i.test(text) && !/Stream #\d+:\d+/.test(text)) {
        return { valid: false, hasVideo: false, hasAudio: false, duration: 0 };
    }

    let duration = 0;
    const durMatch = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i);
    if (durMatch) {
        duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3]);
    }

    const videoMatch = text.match(/Stream #\d+:\d+[^:]*:\s*Video:\s*([^,\s]+)/i);
    const audioMatch = text.match(/Stream #\d+:\d+[^:]*:\s*Audio:\s*([^,\s]+)/i);

    return {
        valid: Boolean(videoMatch || audioMatch),
        hasVideo: Boolean(videoMatch),
        hasAudio: Boolean(audioMatch),
        videoCodec: videoMatch ? videoMatch[1].toLowerCase() : null,
        audioCodec: audioMatch ? audioMatch[1].toLowerCase() : null,
        duration
    };
}

/**
 * Probes video streams, audio streams, codecs, and duration using `ffprobe` (with `ffmpeg -i` fallback).
 * @param {string} inputPath
 * @param {object} [deps]
 * @returns {Promise<{ valid: boolean, hasVideo: boolean, hasAudio: boolean, duration: number, videoCodec: string|null, audioCodec: string|null }>}
 */
async function probeVideoStream(inputPath, deps = {}) {
    if (!inputPath || !fs.existsSync(inputPath)) {
        throw createStickerError('INVALID_VIDEO', 'File video tidak ditemukan.');
    }

    const execBin = deps.runBinary || runBinary;

    try {
        const { stdout } = await execBin('ffprobe', [
            '-v', 'error',
            '-show_format',
            '-show_streams',
            '-of', 'json',
            inputPath
        ], 15000);

        const parsed = JSON.parse(stdout || '{}');
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const videoStream = streams.find(s => s.codec_type === 'video');
        const audioStream = streams.find(s => s.codec_type === 'audio');
        const rawDuration = parsed.format?.duration ?? videoStream?.duration ?? audioStream?.duration ?? 0;
        const duration = Number(rawDuration) || 0;

        return {
            valid: Boolean(videoStream),
            hasVideo: Boolean(videoStream),
            hasAudio: Boolean(audioStream),
            videoCodec: videoStream?.codec_name ? String(videoStream.codec_name).toLowerCase() : null,
            audioCodec: audioStream?.codec_name ? String(audioStream.codec_name).toLowerCase() : null,
            audioSampleRate: audioStream?.sample_rate ? Number(audioStream.sample_rate) : null,
            audioChannels: audioStream?.channels ? Number(audioStream.channels) : null,
            width: videoStream?.width ? Number(videoStream.width) : null,
            height: videoStream?.height ? Number(videoStream.height) : null,
            duration
        };
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Fallback to `ffmpeg -i` when ffprobe binary is absent
            try {
                await execBin('ffmpeg', ['-i', inputPath], 15000);
                return { valid: false, hasVideo: false, hasAudio: false, duration: 0, videoCodec: null, audioCodec: null };
            } catch (ffmpegErr) {
                if (ffmpegErr.code === 'ENOENT') {
                    throw createStickerError('FFMPEG_MISSING', 'FFprobe dan FFmpeg tidak tersedia di sistem untuk memeriksa audio video.');
                }
                return parseFfmpegInspectOutput(ffmpegErr.stderr);
            }
        }
        throw createStickerError('INVALID_VIDEO', 'Video tidak valid atau rusak sehingga gagal dianalisis.');
    }
}

module.exports = {
    MAX_VIDEO_INPUT_BYTES,
    MAX_STICKER_OUTPUT_BYTES,
    MAX_AUDIO_STICKER_DURATION_SEC,
    ensureTmpDir,
    createStickerError,
    runBinary,
    addStickerExif,
    classifyAndValidateMedia,
    convertImageBufferToSticker,
    convertVideoFileToAnimatedSticker,
    probeVideoStream,
    parseFfmpegInspectOutput,
};
