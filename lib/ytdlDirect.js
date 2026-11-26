/**
 * ytdlDirect — fallback YouTube audio downloader via @distube/ytdl-core@5.x.
 *
 * API v5 berubah:
 *   const { Ytdl, chooseFormat } = require('@distube/ytdl-core');
 *   const y = new Ytdl();
 *   const info = await y.getInfo(url);
 *   const fmt = chooseFormat(info.formats, { hasAudio: true, hasVideo: false });
 *
 * Module ini mengunduh stream audio langsung dari googlevideo.com (server YouTube)
 * dan mengembalikan Buffer MP4/M4A. Dikonversi ke MP3 oleh pemanggil (toAudio).
 */
const { Ytdl, chooseFormat } = require('@distube/ytdl-core');
const axios = require('axios');

const YT_ID_REGEX =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;

function extractVideoId(url) {
    const m = String(url).match(YT_ID_REGEX);
    return m ? m[1] : null;
}

function toWatchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Download audio dari YouTube sebagai Buffer.
 *
 * @param {string} url — YouTube URL atau video ID
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, title: string, thumbnail: string, duration: number }>}
 */
async function downloadAudioBuffer(url, opts = {}) {
    const timeout = opts.timeout || 120000;

    const videoId = extractVideoId(url) || (url.length === 11 ? url : null);
    if (!videoId) throw new Error('Invalid YouTube URL or video ID');

    const y = new Ytdl();
    const info = await y.getInfo(toWatchUrl(videoId));
    const formats = info.formats || [];
    if (!formats.length) throw new Error('No playable formats found');

    // Pilih format audio-only dengan kualitas tertinggi
    const audioFmt = chooseFormat(formats, { hasAudio: true, hasVideo: false });
    if (!audioFmt?.url) throw new Error('No audio format URL available');

    const videoDetails = info.videoDetails || {};
    const title = videoDetails.title || 'YouTube Audio';
    const thumbnail =
        (videoDetails.thumbnails?.slice?.(-1)?.[0]?.url) ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const duration = parseInt(videoDetails.lengthSeconds, 10) || 0;

    // Download audio stream → Buffer
    const response = await axios.get(audioFmt.url, {
        responseType: 'arraybuffer',
        timeout,
        maxContentLength: 200 * 1024 * 1024,
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Accept: '*/*',
            Referer: 'https://www.youtube.com/',
        },
    });

    const buffer = Buffer.from(response.data);
    if (!buffer.length) throw new Error('Downloaded audio buffer is empty');

    return { buffer, title, thumbnail, duration, videoId };
}

module.exports = {
    downloadAudioBuffer,
    extractVideoId,
};
