const axios = require('axios');
const yts = require('yt-search');
const { scrapeUrl, downloadBuffer, log } = require('../lib/scraprDownloader');

const KNIGHTBOT_API = 'https://knightbotapi.stream/api/download/ytmp4';
const UNIVERSAL_DOWNLOAD_API = 'https://knightbotapi.stream/api/download';
const KNIGHTBOT_API_KEY = process.env.KNIGHTBOT_API_KEY || 'knight';

function getDownloadUrl(result) {
    if (typeof result === 'string') return result;
    return result?.download || result?.download_url || result?.downloadUrl || result?.dl_url || result?.dl || result?.url || result?.video || result?.link;
}

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

async function tryRequest(getter, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    throw lastError;
}

// EliteProTech API - Primary
async function getEliteProTechVideoByUrl(youtubeUrl) {
    const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(youtubeUrl)}&format=mp4`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.downloadURL) {
        return {
            download: res.data.downloadURL,
            title: res.data.title
        };
    }
    throw new Error('EliteProTech ytdown returned no download');
}

async function getYupraVideoByUrl(youtubeUrl) {
    const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    if (res?.data?.success && res?.data?.data?.download_url) {
        return {
            download: res.data.data.download_url,
            title: res.data.data.title,
            thumbnail: res.data.data.thumbnail
        };
    }
    throw new Error('Yupra returned no download');
}

async function getOkatsuVideoByUrl(youtubeUrl) {
    const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp4?url=${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    // shape: { status, creator, url, result: { status, title, mp4 } }
    if (res?.data?.result?.mp4) {
        return { download: res.data.result.mp4, title: res.data.result.title };
    }
    throw new Error('Okatsu ytmp4 returned no mp4');
}

async function videoCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text;
        const input = text.split(/\s+/).slice(1);
        const quality = ['480p', '720p'].includes(input.at(-1)) ? input.pop() : '480p';
        const searchQuery = input.join(' ').trim();
        
        
        if (!searchQuery) {
            await sock.sendMessage(chatId, { text: 'Mau download video apa, bestie?\nCara pakai: .ytmp4 <link> [480p/720p]' }, { quoted: message });
            return;
        }

        // Determine if input is a YouTube link
        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';
        if (searchQuery.startsWith('http://') || searchQuery.startsWith('https://')) {
            videoUrl = searchQuery;
        } else {
            // Search YouTube for the video
            const { videos } = await yts(searchQuery);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: 'No videos found!' }, { quoted: message });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        // Send thumbnail immediately
        try {
            const ytId = (videoUrl.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/) || [])[1];
            const thumb = videoThumbnail || (ytId ? `https://i.ytimg.com/vi/${ytId}/sddefault.jpg` : undefined);
            const captionTitle = videoTitle || searchQuery;
            if (thumb) {
                await sock.sendMessage(chatId, {
                    image: { url: thumb },
                    caption: `*${captionTitle}*\nDownloading...`
                }, { quoted: message });
            }
        } catch (e) { console.error('[VIDEO] thumb error:', e?.message || e); }
        

        // Validate YouTube URL
        let urls = videoUrl.match(/(?:https?:\/\/)?(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:watch\?v=|v\/|embed\/|shorts\/|playlist\?list=)?)([a-zA-Z0-9_-]{11})/gi);
        if (!urls) {
            await sock.sendMessage(chatId, { text: 'This is not a valid YouTube link!' }, { quoted: message });
            return;
        }

        // Use BotGajeJir API
        let videoData;
        let downloadSuccess = false;
        
        // List of API methods to try
        const apiMethods = [{
            name: 'KnightBot Universal MP4',
            method: async () => {
                const { data } = await axios.get(UNIVERSAL_DOWNLOAD_API, { params: { apikey: KNIGHTBOT_API_KEY, type: 'mp4', url: videoUrl }, timeout: 60000 });
                const download = getDownloadUrl(data?.result);
                if (!data?.success || !/^https?:\/\//i.test(download || '')) throw new Error('Universal API returned no valid video URL');
                return { download, title: data.result?.title || videoTitle, format: data.result?.format || quality };
            }
        }, {
            name: 'ARCANIS BOT',
            method: async () => {
                const { data } = await axios.get(KNIGHTBOT_API, { params: { apikey: process.env.KNIGHTBOT_API_KEY || 'knight', format: quality, url: videoUrl }, timeout: 60000 });
                if (!data?.success || !data.result) throw new Error('BotGajeJir returned no result');
                const result = typeof data.result === 'string' ? { download: data.result } : data.result;
                return { download: result.download || result.dl_url || result.dl || result.url || result.video, title: result.title || videoTitle, format: result.format || quality };
            }
        }];
        
        // Try each API until we successfully get video data
        for (const apiMethod of apiMethods) {
            try {
                videoData = await apiMethod.method();
                const videoUrl_check = videoData.download || videoData.dl || videoData.url;
                
                if (!/^https?:\/\//i.test(videoUrl_check || '')) {
                    console.log(`${apiMethod.name} returned invalid download URL, trying next API...`);
                    continue;
                }
                if (!videoUrl_check) {
                    console.log(`${apiMethod.name} returned no download URL, trying next API...`);
                    continue; // Try next API
                }
                
                downloadSuccess = true;
                break; // Success! Exit the loop
            } catch (apiErr) {
                // API call failed, try next API
                console.log(`${apiMethod.name} API failed:`, apiErr.message);
                continue;
            }
        }
        
        // Last fallback: all registered scrapr-main YouTube scrapers.
        if (!downloadSuccess || !videoData) {
            log('youtube', 'FALLBACK', 'video APIs failed; trying scrapr-main');
            const fallback = await scrapeUrl('youtube', videoUrl, ['mp4']);
            const videos = fallback.downloads.filter(item => item?.url && (/video|mp4/i.test(String(item.type || '') + item.url)));
            const video = videos.sort((a, b) => {
                const resolution = item => {
                    const match = String(item.quality || item.resolution || item.type || '').match(/(\d{3,4})p/i);
                    return match ? Number(match[1]) : 0;
                };
                return resolution(b) - resolution(a);
            })[0] || videos[0];
            if (!video?.url) throw new Error('All download sources failed. The content may be unavailable or blocked in your region.');
            videoData = { download: video.url, title: fallback.title || videoTitle, format: video.quality || video.resolution || 'highest' };
            log('youtube', 'RESOLUTION', `selected=${videoData.format}`);
        }

        // Send video directly using the download URL
        await sock.sendMessage(chatId, {
            video: { url: videoData.download || videoData.dl || videoData.url },
            mimetype: 'video/mp4',
            fileName: `${(videoData.title || videoTitle || 'video').replace(/[^\w\s-]/g, '')}.mp4`,
            caption: `*${videoData.title || videoTitle || 'Video'}*\n📺 ${videoData.format || quality}\n\n> *_Downloaded by ARCANIS BOT MD_*`
        }, { quoted: message });


    } catch (error) {
        console.error('[VIDEO] Command Error:', error?.message || error);
        
        // Provide more specific error messages
        let errorMessage = '❌ Failed to download video.';
        if (error.message && error.message.includes('blocked')) {
            errorMessage = '❌ Download blocked. The content may be unavailable in your region or due to legal restrictions.';
        } else if (error.response?.status === 451 || error.status === 451) {
            errorMessage = '❌ Content unavailable (451). This may be due to legal restrictions or regional blocking.';
        } else if (error.message && error.message.includes('All download sources failed')) {
            errorMessage = '❌ All download sources failed. The content may be unavailable or blocked.';
        } else if (error.message) {
            errorMessage = '❌ Download failed: ' + error.message;
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMessage 
        }, { quoted: message });
    }
}

module.exports = videoCommand; 