const SOUND_STICKER_MAX_SECONDS = 5;

let modulePromise;

/**
 * Loads the ESM sound-sticker helpers on first use.
 * @returns {Promise<object>}
 */
function loadSoundStickerModule() {
    if (!modulePromise) {
        modulePromise = import('@xbibzlibrary/whatsbibz/lib/Utils/sound-sticker.js');
    }
    return modulePromise;
}

/**
 * Downloads the replied-to / attached video with WhatsApp CDN integrity checks.
 * @param {object} message
 * @param {object} [options]
 * @returns {Promise<Buffer>}
 */
async function downloadVideoForSoundSticker(message, options = {}) {
    const mod = await loadSoundStickerModule();
    return mod.downloadVideoForSoundSticker(message, options);
}

/**
 * Converts, uploads, and relays one native audio sticker.
 * @param {object} sock
 * @param {string} jid
 * @param {Buffer} video
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function sendVideoAsSoundSticker(sock, jid, video, options = {}) {
    const mod = await loadSoundStickerModule();
    return mod.sendVideoAsSoundSticker(sock, jid, video, options);
}

/**
 * Maps library / ffmpeg errors to user-facing Indonesian messages.
 * @param {Error} error
 * @returns {string}
 */
function formatAudioStickerError(error) {
    const code = String(error?.code || '');
    switch (code) {
        case 'NO_AUDIO':
        case 'NO_AUDIO_STREAM':
            return '❌ Video ini tidak memiliki audio stream, jadi tidak bisa dibuat menjadi Audio Sticker. Pilih *Sticker Tanpa Audio*.';
        case 'SILENT_AUDIO':
            return '❌ Audio pada video ini terlalu senyap (di bawah -70 dB), jadi tidak bisa dibuat menjadi Audio Sticker.';
        case 'INVALID_AUDIO':
            return '❌ Format audio pada video tidak didukung atau gagal diproses menjadi Opus.';
        case 'VIDEO_TOO_LARGE':
            return '❌ Ukuran video melebihi batas maksimal 20 MB untuk Audio Sticker.';
        case 'STICKER_TOO_LARGE':
            return '❌ Sticker animasi hasil konversi melebihi batas 500 KB. Coba video yang lebih pendek atau lebih sederhana.';
        case 'VIDEO_NOT_FOUND':
            return '❌ Video tidak ditemukan. Balas pesan video dengan `.s 2` atau `.sticker audio`.';
        case 'VIEW_ONCE_REJECTED':
            return '❌ Video *lihat sekali* tidak didukung untuk Audio Sticker.';
        case 'UNSUPPORTED_VIDEO':
            return '❌ Format video tidak didukung. Gunakan video MP4 atau MOV.';
        case 'VIDEO_METADATA_MISSING':
            return '❌ Metadata video tidak lengkap. Kirim ulang video lalu coba lagi.';
        case 'MEDIA_INTEGRITY_FAILED':
            return '❌ Unduhan video tidak cocok dengan data aslinya. Kirim ulang video lalu coba lagi.';
        case 'VIDEO_DOWNLOAD_FAILED':
        case 'VIDEO_DOWNLOAD_TIMEOUT':
            return '❌ Gagal mengunduh video dari WhatsApp. Kirim ulang video lalu coba lagi.';
        case 'UPLOAD_FAILED':
            return '❌ Gagal mengunggah sticker/audio ke WhatsApp. Coba lagi beberapa saat.';
        case 'FFMPEG_NOT_FOUND':
        case 'FFMPEG_MISSING':
            return '❌ FFmpeg/FFprobe tidak tersedia di server. Audio Sticker tidak bisa diproses.';
        case 'FFMPEG_TIMEOUT':
            return '❌ Proses konversi audio sticker melebihi batas waktu. Coba video yang lebih pendek.';
        case 'FFMPEG_FAILED':
            return '❌ FFmpeg gagal mengonversi video. Pastikan video valid dan codec audio didukung.';
        case 'BAD_JID':
            return '❌ Audio Sticker hanya bisa dikirim ke chat pribadi atau grup, bukan status/newsletter.';
        case 'BAD_SOCKET':
            return '❌ Koneksi WhatsApp tidak mendukung pengiriman Audio Sticker. Coba restart bot.';
        case 'BAD_OPTIONS':
            return '❌ Opsi konversi Audio Sticker tidak valid.';
        case 'INVALID_VIDEO':
        case 'NO_VIDEO':
            return '❌ Video tidak valid atau rusak sehingga tidak dapat diproses.';
        default:
            return `❌ Gagal membuat Audio Sticker${error?.message ? `: ${error.message}` : '. Coba lagi nanti.'}`;
    }
}

module.exports = {
    SOUND_STICKER_MAX_SECONDS,
    loadSoundStickerModule,
    downloadVideoForSoundSticker,
    sendVideoAsSoundSticker,
    formatAudioStickerError
};