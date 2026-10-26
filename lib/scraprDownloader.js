const scrapr = require('@coflyn/scrapr');
const axios = require('axios');
const crypto = require('crypto');
const soundcloudApi = require('./soundcloudApi');
const { hlsToMp3 } = require('./ffmpegConvert');

function getShortId() {
    return crypto.randomBytes(3).toString('hex');
}

function log(platform, stage, message, data = null) {
    const timestamp = new Date().toISOString().substring(11, 19);
    let logText = `[${timestamp}] [Downloader][${platform}][${stage}] ${message}`;
    if (data) logText += ` ${JSON.stringify(data)}`;
    console.log(logText);
}

// Method fallback per platform
const platformMethods = {
    tiktok: [scrapr.tiktok?.snaptik, scrapr.tiktok?.tiktokio, scrapr.tiktok?.savetik, scrapr.tiktok?.ssstik, scrapr.tiktok?.tikdownloader].filter(Boolean),
    instagram: [scrapr.instagram?.direct, scrapr.instagram?.indown, scrapr.instagram?.snapinsta, scrapr.instagram?.snapsave].filter(Boolean),
    facebook: [scrapr.facebook?.fdown, scrapr.facebook?.snapsave].filter(Boolean),
    twitter: [scrapr.twitter?.direct, scrapr.twitter?.savetwt, scrapr.twitter?.tweeload, scrapr.twitter?.tvd].filter(Boolean),
    youtube: [scrapr.youtube?.ytmp3, scrapr.youtube?.ytmp3gg].filter(Boolean),
    pinterest: [scrapr.pinterest?.direct, scrapr.pinterest?.pindown].filter(Boolean),
    threads: [scrapr.threads?.threadster].filter(Boolean),
    reddit: [scrapr.reddit?.rapidsave].filter(Boolean),
    pixiv: [scrapr.pixiv?.ajax].filter(Boolean),
    rednote: [scrapr.rednote?.direct].filter(Boolean),
    // Resolver API SoundCloud dieksekusi dulu; klickaud hanya fallback terakhir
    soundcloud: [soundcloudApi.resolveSoundcloud, scrapr.soundcloud?.klickaud].filter(Boolean),
    douyin: [scrapr.douyin?.direct].filter(Boolean),
    bilibili: [scrapr.bilibili?.direct].filter(Boolean),
    bandcamp: [scrapr.bandcamp?.direct, scrapr.bandcamp?.bandcampdownloader].filter(Boolean),
    spotify: [scrapr.spotify?.spotmate, scrapr.spotify?.spotidown, scrapr.spotify?.soundloaders].filter(Boolean),
    applemusic: [scrapr.applemusic?.aplmate].filter(Boolean),
    terabox: [scrapr.terabox?.sechno].filter(Boolean)
};

async function scrapeUrl(platform, url, args = []) {
    const requestId = getShortId();
    log(platform, 'START', `request=${requestId} url=${url}`);
    const methods = platformMethods[platform];
    if (!methods || !methods.length) throw new Error(`Platform ${platform} not supported`);

    const reasons = [];
    for (let i = 0; i < methods.length; i++) {
        const method = methods[i];
        try {
            log(platform, 'SCRAPER', `method=${method.name || i + 1} attempt=${i + 1}`);
            const response = await method(url, ...args);
            if (response?.status && response.result?.downloads?.length) {
                log(platform, 'SCRAPER', `method=${method.name || i + 1} status=success downloads=${response.result.downloads.length}`);
                return response.result;
            }
            reasons.push(`${method.name || i + 1}: ${String(response?.message || 'no download result').slice(0, 200)}`);
            log(platform, 'SCRAPER', `method=${method.name || i + 1} status=no-result reason=${reasons[reasons.length - 1].slice(0, 160)}`);
        } catch (error) {
            reasons.push(`${method.name || i + 1}: ${String(error.message || error).slice(0, 200)}`);
            log(platform, 'SCRAPER', `method=${method.name || i + 1} status=failed error=${error.message}`);
        }
    }
    throw new Error(`All scraper methods failed (${reasons.join(' | ')})`);
}

async function downloadBuffer(url, options = {}) {
    // Playlist HLS (mis. track SoundCloud) → konversi ke MP3 lewat ffmpeg, bukan unduhan biasa
    if (/\.m3u8(?:[?#]|$)/i.test(url) || options.hls) {
        const start = Date.now();
        try {
            const out = await hlsToMp3(url, { timeout: options.timeout || 150000 });
            const size = (out.buffer.length / 1024 / 1024).toFixed(2);
            log(options.platform || 'Download', 'DOWNLOAD', `status=success mode=hls size=${size}MB duration=${Date.now() - start}ms`);
            return out;
        } catch (error) {
            log(options.platform || 'Download', 'DOWNLOAD', `status=failed mode=hls duration=${Date.now() - start}ms error=${error.message}`);
            throw error;
        }
    }

    const start = Date.now();
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: options.timeout || 90000,
            maxContentLength: options.maxSize || 500 * 1024 * 1024,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', 
                'Accept': '*/*', 
                'Referer': options.referer || 'https://www.youtube.com/', 
                ...options.headers 
            }
        });
        const contentType = String(response.headers['content-type'] || '').toLowerCase();
        if (options.expectedType === 'video' && contentType.startsWith('image/')) {
            throw new Error(`Expected video, received ${contentType}`);
        }
        const buffer = Buffer.from(response.data);
        const size = (buffer.length / 1024 / 1024).toFixed(2);
        const duration = Date.now() - start;
        log(options.platform || 'Download', 'DOWNLOAD', `status=success size=${size}MB contentType=${contentType || 'unknown'} duration=${duration}ms`);
        return { buffer, contentType };
    } catch (error) {
        const duration = Date.now() - start;
        log(options.platform || 'Download', 'DOWNLOAD', `status=failed duration=${duration}ms error=${error.message}`);
        throw error;
    }
}

async function sendMedia(sock, chatId, message, buffer, options) {
    const start = Date.now();
    try {
        const sendOptions = { quoted: message };
        let caption = options.caption || '';
        if (options.title) caption = `📥 ${options.title}`;

        let payload;
        if (options.type === 'video') {
            payload = { video: buffer, mimetype: 'video/mp4', caption };
        } else if (options.type === 'audio') {
            payload = { audio: buffer, mimetype: 'audio/mpeg', fileName: options.fileName || 'audio.mp3' };
        } else if (options.type === 'image') {
            payload = { image: buffer, caption };
        } else {
            payload = { document: buffer, fileName: options.fileName || 'file', mimetype: 'application/octet-stream', caption };
        }

        await sock.sendMessage(chatId, payload, sendOptions);
        const duration = Date.now() - start;
        log(options.platform, 'SEND', `status=success type=${options.type} duration=${duration}ms`);
        return true;
    } catch (error) {
        const duration = Date.now() - start;
        log(options.platform, 'SEND', `status=failed duration=${duration}ms error=${error.message}`);
        throw error;
    }
}

async function downloadAndSend(sock, chatId, message, platform, url, options = {}) {
    const requestId = getShortId();
    const start = Date.now();
    const logs = [];

    try {
        log(platform, 'VALIDATION', `request=${requestId} url=${url}`);

        // Scrape
        const result = await scrapeUrl(platform, url);
        if (!result.downloads.length) throw new Error('No media downloads');

        // Process media
        let success = false;
        const maxItems = options.maxItems || Math.min(result.downloads.length, 10);

        for (let i = 0; i < maxItems; i++) {
            const download = result.downloads[i];
            if (!download?.url) continue;

            const itemType = String(download.type || result.type || '').toLowerCase();
            const isVideo = itemType === 'video' || itemType === 'mp4' || itemType.includes('video') || /\.mp4(?:[?#]|$)/i.test(download.url);
            // 'mp3'/'m4a' dicakup sebagai substring agar label seperti "MP3 (128kbps)" tidak terlewat
            const isAudio = itemType === 'audio' || itemType.includes('audio') || itemType.includes('mp3') || itemType.includes('m4a') || /\.(mp3|m4a|aac|ogg|wav)(?:[?#]|$)/i.test(download.url);
            const normalizedType = isVideo ? 'video' : isAudio ? 'audio' : itemType.includes('image') ? 'image' : null;

            log(platform, 'MEDIA', `item=${i + 1}/${maxItems} declaredType=${itemType || 'unknown'} normalizedType=${normalizedType || 'unknown'}`);
            if (!normalizedType) {
                log(platform, 'SKIP', `item=${i + 1}/${maxItems} reason=unknown-media-type`);
                continue;
            }
            if (platform === 'pinterest' && i === 0 && result.downloads.length > 1 && normalizedType === 'image') {
                log(platform, 'SKIP', `item=${i + 1}/${maxItems} reason=pinterest-thumbnail-skip`);
                continue;
            }
            if (options.mediaType && normalizedType !== options.mediaType) {
                log(platform, 'SKIP', `item=${i + 1}/${maxItems} reason=expected-${options.mediaType}`);
                continue;
            }
            if (options.videoOnly && normalizedType === 'image' && result.downloads.some(d => ['video', 'mp4'].includes(String(d.type || '').toLowerCase()))) {
                log(platform, 'SKIP', `item=${i + 1}/${maxItems} reason=thumbnail-prefer-video`);
                continue;
            }

            try {
                const buffer = await downloadBuffer(download.url, {
                    platform,
                    timeout: 120000,
                    maxSize: isVideo ? 200 * 1024 * 1024 : 100 * 1024 * 1024,
                    expectedType: normalizedType,
                    referer: platform === 'instagram' ? 'https://www.instagram.com/' : platform === 'tiktok' ? 'https://www.tiktok.com/' : undefined
                });

                await sendMedia(sock, chatId, message, buffer.buffer, {
                    platform,
                    type: normalizedType,
                    title: result.title || platform,
                    fileName: result.title ? `${result.title.replace(/[^\w\s-]/g, '')}.${normalizedType === 'audio' ? 'mp3' : normalizedType === 'video' ? 'mp4' : 'jpg'}` : undefined
                });

                success = true;
                if (isAudio || options.singleItem || platform === 'instagram' || platform === 'tiktok' || platform === 'youtube') break;

            } catch (itemError) {
                log(platform, 'ITEM_ERROR', `item=${i + 1}/${maxItems} error=${itemError.message}`);
            }
        }

        if (!success) throw new Error('All media items failed');

        const totalDuration = Date.now() - start;
        log(platform, 'SUCCESS', `request=${requestId} duration=${totalDuration}ms`);
        return true;

    } catch (error) {
        const totalDuration = Date.now() - start;
        log(platform, 'FAILED', `request=${requestId} stage=${error.stage || 'unknown'} duration=${totalDuration}ms error=${error.message}`);
        throw error;
    }
}

// Detect platform from URL
function detectPlatformFromUrl(url) {
    if (/tiktok\.com/i.test(url)) return 'tiktok';
    if (/instagram\.com/i.test(url)) return 'instagram';
    if (/facebook\.com|fb\.com/i.test(url)) return 'facebook';
    if (/(twitter|x)\.com/i.test(url)) return 'twitter';
    if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
    if (/pinterest\.(com|co\.id)|pin\.it/i.test(url)) return 'pinterest';
    if (/threads\.(net|com)/i.test(url)) return 'threads';
    if (/reddit\.com/i.test(url)) return 'reddit';
    if (/pixiv\.net/i.test(url)) return 'pixiv';
    if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'rednote';
    if (/soundcloud\.com|snd\.sc/i.test(url)) return 'soundcloud';
    if (/douyin\.com/i.test(url)) return 'douyin';
    if (/bilibili\.com/i.test(url)) return 'bilibili';
    if (/bandcamp\.com/i.test(url)) return 'bandcamp';
    if (/spotify\.com/i.test(url)) return 'spotify';
    if (/music\.apple\.com/i.test(url)) return 'applemusic';
    if (/terabox\.(com|app)/i.test(url)) return 'terabox';
    return null;
}

module.exports = {
    scrapeUrl,
    downloadBuffer,
    sendMedia,
    downloadAndSend,
    detectPlatformFromUrl,
    platformMethods,
    log
};
