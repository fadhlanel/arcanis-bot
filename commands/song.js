const axios = require('axios');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const { toAudio } = require('../lib/converter');
const { extractDownloadUrl, isLocalConverter } = require('../lib/extractUrl');
const ytdl = require('ytdl-core');
const { scrapeUrl, downloadBuffer, log } = require('../lib/scraprDownloader');

const KNIGHTBOT_API = 'https://knightbotapi.stream/api/download/ytaudio';
const UNIVERSAL_DOWNLOAD_API = 'https://knightbotapi.stream/api/download';
const KNIGHTBOT_API_KEY = process.env.KNIGHTBOT_API_KEY || 'knight';
const SIPUTZX_API = 'https://api.siputzx.my.id/api/d/ummy';
const ELITEPROTECH_YTMP3 = 'https://eliteprotech-apis.zone.id/download/ytmp3';
const ELITEPROTECH_YTDOWN = 'https://eliteprotech-apis.zone.id/download/ytdown';

const AXIOS_DEFAULTS = {
	timeout: 60000,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Accept': 'application/json, text/plain, */*'
	}
};

async function songCommand(sock, chatId, message) {
    try {
        const fullText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const text = fullText.replace(/^\.(song|play|mp3|ytmp3|ytmp4)\s*/i, '').trim();
        if (!text) {
            await sock.sendMessage(chatId, { text: 'Usage: .song <song name or YouTube link>' }, { quoted: message });
            return;
        }

        let video;
        console.log(`[Song] Input: ${text}`);
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
            // Extract video ID from URL
            let videoId = null;
            try {
                const url = new URL(text);
                if (url.hostname === 'youtu.be') {
                    videoId = url.pathname.slice(1);
                } else if (url.searchParams.has('v')) {
                    videoId = url.searchParams.get('v');
                } else if (url.pathname.includes('/shorts/')) {
                    videoId = url.pathname.split('/shorts/')[1]?.split('?')[0];
                }
            } catch (e) {
                videoId = null;
            }
            video = {
                url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : text,
                title: 'Video',
                thumbnail: null,
                timestamp: 'N/A'
            };
        } else {
            const search = await yts(text);
            if (!search?.videos?.length) {
                await sock.sendMessage(chatId, { text: 'No results found.' }, { quoted: message });
                return;
            }
            video = search.videos[0];
            console.log(`[Song] Search result: title="${video.title}", videoId="${video.videoId}", url="${video.url}"`);
            
            // Ensure video has valid URL and videoId
            if (!video.videoId) {
                await sock.sendMessage(chatId, { text: '❌ YouTube search results missing video ID.' }, { quoted: message });
                return;
            }
            video.url = `https://www.youtube.com/watch?v=${video.videoId}`;
        }

        // Final validation: ensure URL is complete
        if (!video.url || !video.url.includes('v=') && !video.url.includes('youtu.be/')) {
            await sock.sendMessage(chatId, { text: '❌ Invalid video URL. Try again.' }, { quoted: message });
            return;
        }

        // Keep YouTube query parameters for EliteProTech; endpoint accepts full links.
        const sourceVideoUrl = video.url;
        const cleanVideoUrl = sourceVideoUrl;

        // Inform user
        const captionText = `🎵 Downloading: *${video.title}*\n⏱ Duration: ${video.timestamp || 'N/A'}`;
        if (video.thumbnail) {
            try {
                await sock.sendMessage(chatId, {
                    image: { url: video.thumbnail },
                    caption: captionText
                }, { quoted: message });
            } catch (e) {
                await sock.sendMessage(chatId, { text: captionText }, { quoted: message });
            }
        } else {
            await sock.sendMessage(chatId, { text: captionText }, { quoted: message });
        }

		let audioData;
		let audioBuffer;
		let downloadSuccess = false;
		let sourcePlatform = 'youtube'; // Default label
		
		// Deteksi platform input langsung (link Spotify, SoundCloud, YouTube)
		if (text.includes('spotify.com')) sourcePlatform = 'spotify';
		else if (text.includes('soundcloud.com')) sourcePlatform = 'soundcloud';
		else if (text.includes('youtube.com') || text.includes('youtu.be')) sourcePlatform = 'youtube';

		// List of API methods to try
		const apiMethods = [{
            name: 'Siputzx',
            method: async () => {
                console.log('[Song] Trying Siputzx...');
                const { data } = await axios.get(SIPUTZX_API, { 
                    params: { url: cleanVideoUrl }, 
                    timeout: 60000,
                    headers: AXIOS_DEFAULTS.headers
                });
                console.log('[Song] Siputzx responded');
                
                if (!data?.status || !data?.data) throw new Error('invalid response');
                
                const result = data.data;
                
                // Skip if cipher is true and no direct stream
                if (result.cipher === true) {
                    console.log('[Song] Siputzx: cipher=true, skipping');
                    throw new Error('Siputzx: encrypted content');
                }
                
                const mp3 = result?.stream?.mp3?.['320'] || result?.stream?.mp3?.['256'] || result?.stream?.mp3?.['192'];
                let download = mp3?.streams?.[0] || result?.url?.[0]?.url || result?.dl;
                
                // Check if it's a local-converter fake URL
                if (isLocalConverter(download)) {
                    console.log('[Song] Siputzx returned local-converter, skipping');
                    throw new Error('Siputzx returned local-converter marker');
                }
                
                download = extractDownloadUrl(download);
                if (!download) throw new Error('Siputzx: no valid download URL');
                
                return { download, title: result?.meta?.title || video.title };
            }
        }, {
            name: 'EliteProTech YTMP3',
            method: async () => {
                console.log('[Song] Trying EliteProTech YTMP3...');
                const apiUrl = `${ELITEPROTECH_YTMP3}?url=${encodeURIComponent(sourceVideoUrl)}`;
                const { data } = await axios.get(apiUrl, {
                    timeout: 60000,
                    headers: AXIOS_DEFAULTS.headers
                });
                console.log('[Song] EliteProTech YTMP3 responded:', JSON.stringify(data).slice(0, 1000));
                
                const download = data?.download?.downloadUrl || extractDownloadUrl(data);
                if (!download) throw new Error('EliteProTech YTMP3: no URL');
                
                return { download, title: data?.download?.title || data?.result?.title || data?.title || video.title };
            }
        }, {
            name: 'EliteProTech YTDown',
            method: async () => {
                console.log('[Song] Trying EliteProTech YTDown...');
                const apiUrl = `${ELITEPROTECH_YTDOWN}?url=${encodeURIComponent(cleanVideoUrl)}&format=mp3`;
                const { data } = await axios.get(apiUrl, {
                    timeout: 60000,
                    headers: AXIOS_DEFAULTS.headers
                });
                console.log('[Song] EliteProTech YTDown responded:', JSON.stringify(data).slice(0, 1000));
                
                const download = data?.download?.downloadUrl || extractDownloadUrl(data);
                if (!download) throw new Error('EliteProTech YTDown: no URL');
                
                return { download, title: data?.download?.title || data?.result?.title || data?.title || video.title };
            }
        }, {
            name: 'KnightBot Universal',
            method: async () => {
                console.log('[Song] Trying KnightBot Universal...');
                const { data } = await axios.get(UNIVERSAL_DOWNLOAD_API, { 
                    params: { apikey: KNIGHTBOT_API_KEY, type: 'mp3', url: cleanVideoUrl }, 
                    timeout: 45000 
                });
                console.log('[Song] KnightBot Universal responded');
                
                const download = extractDownloadUrl(data?.result || data);
                if (!download) throw new Error('no valid URL');
                
                return { download, title: data.result?.title || video.title };
            }
        }, {
            name: 'KnightBot YouTube Audio',
            method: async () => {
                console.log('[Song] Trying KnightBot YouTube Audio...');
                const res = await axios.get(KNIGHTBOT_API, {
                    params: { apikey: KNIGHTBOT_API_KEY, format: '128kbps', url: cleanVideoUrl },
                    timeout: 45000
                });
                console.log('[Song] KnightBot YouTube Audio responded');
                
                if (!res.data?.success || !res.data.result) throw new Error('no result');
                
                const download = extractDownloadUrl(res.data.result);
                if (!download) throw new Error('no valid URL');
                
                return { download, title: res.data.result?.title || video.title };
            }
        }, {
            name: 'YTDL-Core',
            method: async () => {
                console.log('[Song] Trying YTDL-Core...');
                const info = await ytdl.getInfo(cleanVideoUrl);
                const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
                if (!format?.url) throw new Error('no audio format');
                return { download: format.url, title: info.videoDetails.title || video.title };
            }
        }];
		
		// Try each API until we successfully download audio
		for (const apiMethod of apiMethods) {
			try {
				audioData = await apiMethod.method();
				const audioUrl = audioData.download;
				
				if (!audioUrl || typeof audioUrl !== 'string' || !/^https?:\/\//i.test(audioUrl)) {
					console.log(`[Song] ${apiMethod.name}: invalid URL, trying next...`);
					await new Promise(r => setTimeout(r, 1000));
					continue;
				}
				
				console.log(`[Song] ${apiMethod.name}: downloading audio file...`);
				await sock.sendMessage(chatId, { text: `⏳ Mendownload dari ${apiMethod.name}...` }, { quoted: message });
				
				// Download audio
				const audioResponse = await axios.get(audioUrl, {
					responseType: 'arraybuffer',
					timeout: 90000,
					maxContentLength: Infinity,
					maxBodyLength: Infinity,
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
						'Accept': '*/*'
					}
				});
				
				audioBuffer = Buffer.from(audioResponse.data);
				
				if (audioBuffer && audioBuffer.length > 0) {
					console.log(`[Song] ${apiMethod.name}: success! (${audioBuffer.length} bytes)`);
					await sock.sendMessage(chatId, { text: `✅ Berhasil download dari ${apiMethod.name}` }, { quoted: message });
					downloadSuccess = true;
					break;
				}
				
			} catch (apiErr) {
				const status = apiErr.response?.status ? ` HTTP ${apiErr.response.status}` : '';
				console.log(`[Song] ${apiMethod.name} failed:${status} ${apiErr.message}`);
				await new Promise(r => setTimeout(r, 1000));
				continue;
			}
		}
		
		// Last fallback: every registered scrapr-main YouTube audio scraper with explicit format.
		if (!downloadSuccess || !audioBuffer) {
			log('youtube', 'FALLBACK', 'song APIs failed; trying scrapr-main');
			const fallback = await scrapeUrl('youtube', cleanVideoUrl, ['mp3']);
			const audio = fallback.downloads.find(item => /audio|mp3|m4a/i.test(String(item.type || '') + item.url));
			if (!audio?.url) throw new Error('All download sources failed. The content may be unavailable or blocked.');
			audioBuffer = (await downloadBuffer(audio.url, { platform: 'youtube', expectedType: 'audio' })).buffer;
			audioData = { title: fallback.title || video.title };
			sourcePlatform = 'youtube';
		}

		// Validate buffer
		if (!audioBuffer || audioBuffer.length === 0) {
			throw new Error('Downloaded audio buffer is empty');
		}

		// Send audio
		await sock.sendMessage(chatId, {
			audio: audioBuffer,
			mimetype: 'audio/mpeg',
			fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
			ptt: false
		}, { quoted: message });
		await sock.sendMessage(chatId, { text: `✅ Selesai! Sumber: ${sourcePlatform.toUpperCase()}` }, { quoted: message });

    } catch (err) {
        console.error('[Song] Command error:', err.message);
        
        let errorMessage = '❌ Failed to download song.';
        if (err.message && err.message.includes('blocked')) {
            errorMessage = '❌ Download blocked. The content may be unavailable in your region.';
        } else if (err.message && err.message.includes('All download sources failed')) {
            errorMessage = '❌ All APIs failed. Try a different song or use VPN.';
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMessage 
        }, { quoted: message });
    }
}

module.exports = songCommand;
