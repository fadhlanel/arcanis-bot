const axios = require('axios');
const yts = require('yt-search');
const { toAudio } = require('../lib/converter');
const { scrapeUrl, downloadBuffer, log } = require('../lib/scraprDownloader');

async function songCommand(sock, chatId, message) {
    try {
        const fullText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        const text = fullText.replace(/^\.(song|play|mp3|ytmp3|ytmp4)\s*/i, '').trim();
        if (!text) {
            await sock.sendMessage(chatId, { text: 'Usage: .song <judul lagu / link YouTube / Spotify / SoundCloud>' }, { quoted: message });
            return;
        }

        console.log(`[Song] Input: ${text}`);

        // === DIRECT LINK HANDLER ===
        const isSpotify    = text.includes('spotify.com');
        const isSoundCloud = text.includes('soundcloud.com');
        const isYouTube    = text.includes('youtube.com') || text.includes('youtu.be');

        if (isSpotify || isSoundCloud) {
            const platform = isSpotify ? 'spotify' : 'soundcloud';
            await sock.sendMessage(chatId, { text: `⏳ Mengambil audio dari ${platform}...` }, { quoted: message });
            try {
                const result = await scrapeUrl(platform, text);
                const audio = result.downloads.find(d => /audio|mp3|m4a/i.test(String(d.type || '') + d.url)) || result.downloads[0];
                if (!audio?.url) throw new Error(`${platform}: no audio URL`);
                let { buffer } = await downloadBuffer(audio.url, { platform, timeout: 120000 });
                try { buffer = await toAudio(buffer, 'mp3'); } catch (convErr) { console.log(`[Song] toAudio failed: ${convErr.message}`); }
                await sock.sendMessage(chatId, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${(result.title || text).replace(/[^\w\s-]/g, '')}.mp3`,
                    ptt: false
                }, { quoted: message });
                await sock.sendMessage(chatId, { text: `✅ Selesai! Sumber: ${platform.toUpperCase()}` }, { quoted: message });
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ Gagal download dari ${platform}: ${e.message}` }, { quoted: message });
            }
            return;
        }

        // === YOUTUBE LINK HANDLER ===
        let candidates = [];
        if (isYouTube) {
            let videoId = null;
            try {
                const parsedUrl = new URL(text);
                if (parsedUrl.hostname === 'youtu.be') {
                    videoId = parsedUrl.pathname.slice(1).split('/')[0];
                } else if (parsedUrl.searchParams.has('v')) {
                    videoId = parsedUrl.searchParams.get('v');
                } else if (parsedUrl.pathname.includes('/shorts/')) {
                    videoId = parsedUrl.pathname.split('/shorts/')[1]?.split('?')[0]?.split('/')[0];
                } else if (parsedUrl.pathname.includes('/embed/')) {
                    videoId = parsedUrl.pathname.split('/embed/')[1]?.split('?')[0]?.split('/')[0];
                }
            } catch (_) {}

            // Regex ekstraksi ID 11 karakter cadangan jika URL object gagal
            if (!videoId) {
                const match = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
                if (match) videoId = match[1];
            }

            console.log(`[Song] Extracted YouTube ID from share link: ${videoId || 'FAILED'}`);

            if (videoId) {
                candidates.push({
                    url: `https://youtu.be/${videoId}`,
                    videoId: videoId,
                    title: 'YouTube Track',
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    timestamp: 'N/A'
                });
            } else {
                candidates.push({
                    url: text,
                    videoId: null,
                    title: 'YouTube Track',
                    thumbnail: null,
                    timestamp: 'N/A'
                });
            }
        } else {
            // === TEXT SEARCH: Loop multiple candidate results ===
            let searchResults = [];
            try {
                const search = await yts(text);
                if (search?.videos?.length) {
                    // Filter shorts/livestream & ambil max 5 video relevan
                    searchResults = search.videos
                        .filter(v => v.videoId && (!v.seconds || (v.seconds >= 30 && v.seconds <= 900)))
                        .slice(0, 5);
                }
            } catch (_) {}

            if (searchResults.length > 0) {
                candidates = searchResults.map(v => ({
                    ...v,
                    url: `https://youtu.be/${v.videoId}`
                }));
                console.log(`[Song] Search found ${candidates.length} candidate(s). Top: "${candidates[0].title}" (${candidates[0].videoId})`);
            } else {
                // Fallback: cari di SoundCloud
                console.log('[Song] YouTube search gagal, coba SoundCloud...');
                await sock.sendMessage(chatId, { text: `🔎 YouTube tidak ketemu, coba SoundCloud...` }, { quoted: message });
                try {
                    const scSearch = await axios.get(`https://soundcloud.com/search?q=${encodeURIComponent(text)}`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
                        timeout: 15000
                    });
                    const scUrl = scSearch.data.match(/href="(https:\/\/soundcloud\.com\/[^"?]+)"[^>]*>[\s\S]*?itemprop="name"/)?.[1]
                                || scSearch.data.match(/soundcloud\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+/)?.[0];
                    if (!scUrl) throw new Error('no SoundCloud result');
                    const fullScUrl = scUrl.startsWith('http') ? scUrl : `https://${scUrl}`;
                    await sock.sendMessage(chatId, { text: `⏳ Download dari SoundCloud...` }, { quoted: message });
                    const result = await scrapeUrl('soundcloud', fullScUrl);
                    const audio = result.downloads.find(d => /audio|mp3|m4a/i.test(String(d.type || '') + d.url)) || result.downloads[0];
                    if (!audio?.url) throw new Error('no audio URL');
                    let { buffer } = await downloadBuffer(audio.url, { platform: 'soundcloud', timeout: 120000 });
                    try { buffer = await toAudio(buffer, 'mp3'); } catch (convErr) { console.log(`[Song] toAudio failed: ${convErr.message}`); }
                    await sock.sendMessage(chatId, {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${(result.title || text).replace(/[^\w\s-]/g, '')}.mp3`,
                        ptt: false
                    }, { quoted: message });
                    await sock.sendMessage(chatId, { text: `✅ Selesai! Sumber: SOUNDCLOUD` }, { quoted: message });
                } catch (scErr) {
                    console.log('[Song] SoundCloud fallback failed:', scErr.message);
                    await sock.sendMessage(chatId, { text: '❌ Lagu tidak ditemukan di YouTube maupun SoundCloud.' }, { quoted: message });
                }
                return;
            }
        }

        if (!candidates.length) {
            await sock.sendMessage(chatId, { text: '❌ Tidak ada hasil video yang valid.' }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, { text: `🔎 Menemukan ${candidates.length} versi, sedang mencocokkan audio terbaik...` }, { quoted: message });

        let audioData = null;
        let audioBuffer = null;
        let chosenVideo = null;
        let candidateAttemptLogs = [];
        let sourcePlatform = 'YouTube (Scraper)';
        const ELITEPROTECH_YTMP3 = 'https://eliteprotech-apis.zone.id/download/ytmp3';

        // === TRY ELITEPROTECH ACROSS CANDIDATES ===
        for (let idx = 0; idx < candidates.length; idx++) {
            const currentVideo = candidates[idx];
            console.log(`[Song] Trying EliteProTech on candidate [${idx + 1}/${candidates.length}]: "${currentVideo.title}" (${currentVideo.url})`);
            
            // Format link standar yang bersih (youtu.be tanpa embel-embel query tracking ?si=)
            const cleanShareUrl = currentVideo.videoId ? `https://youtu.be/${currentVideo.videoId}` : currentVideo.url;

            let candidateDlUrl = null;
            let candidateTitle = currentVideo.title;

            try {
                const { data } = await axios.get(`${ELITEPROTECH_YTMP3}?url=${encodeURIComponent(cleanShareUrl)}`, {
                    timeout: 25000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' }
                });
                if (data?.status && data?.download?.downloadUrl) {
                    candidateDlUrl = data.download.downloadUrl;
                    candidateTitle = data.download.title || candidateTitle;
                    console.log(`[Song] EliteProTech URL found on candidate [${idx + 1}] using ${cleanShareUrl}`);
                } else {
                    candidateAttemptLogs.push(`❌ Versi [${idx + 1}] "${currentVideo.title.slice(0, 30)}...": Video tidak tersedia / proteksi copyright`);
                    console.log(`[Song] EliteProTech empty downloadUrl on ${cleanShareUrl}`);
                }
            } catch (apiErr) {
                candidateAttemptLogs.push(`❌ Versi [${idx + 1}] "${currentVideo.title.slice(0, 30)}...": Server sibuk`);
                console.log(`[Song] EliteProTech call error on ${cleanShareUrl}: ${apiErr.message}`);
            }

            if (candidateDlUrl) {
                try {
                    console.log(`[Song] Fetching audio buffer from EliteProTech download URL...`);
                    const audioResponse = await axios.get(candidateDlUrl, {
                        responseType: 'arraybuffer',
                        timeout: 90000,
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }
                    });
                    let buf = Buffer.from(audioResponse.data);
                    if (buf && buf.length > 0) {
                        try { buf = await toAudio(buf, 'mp3'); } catch (convErr) { console.log(`[Song] toAudio failed: ${convErr.message}`); }
                        audioBuffer = buf;
                        audioData = { title: candidateTitle };
                        chosenVideo = currentVideo;
                        sourcePlatform = `EliteProTech (Versi ${idx + 1})`;
                        candidateAttemptLogs.push(`✅ Versi [${idx + 1}] "${candidateTitle.slice(0, 30)}...": Berhasil diunduh`);
                        console.log(`[Song] EliteProTech success with candidate [${idx + 1}]! (${audioBuffer.length} bytes)`);
                        break; // Berhasil, keluar dari loop candidate
                    }
                } catch (dlErr) {
                    candidateAttemptLogs.push(`❌ Versi [${idx + 1}]: Gagal unduh stream`);
                    console.log(`[Song] Failed to download audio buffer from candidate [${idx + 1}]: ${dlErr.message}`);
                }
            }
        }

        // === FALLBACK: Scrapr-main across candidates ===
        if (!audioBuffer || audioBuffer.length === 0) {
            log('youtube', 'FALLBACK', 'EliteProTech failed on all candidates; trying scrapr-main');
            for (let idx = 0; idx < candidates.length; idx++) {
                const currentVideo = candidates[idx];
                try {
                    console.log(`[Song] Trying scrapr-main fallback on candidate [${idx + 1}/${candidates.length}]: ${currentVideo.url}`);
                    const fallback = await scrapeUrl('youtube', currentVideo.url, ['mp3']);
                    const audio = fallback?.downloads?.find(item => /audio|mp3|m4a/i.test(String(item.type || '') + item.url)) || fallback?.downloads?.[0];
                    if (!audio?.url) continue;

                    let buf = (await downloadBuffer(audio.url, { platform: 'youtube', expectedType: 'audio' })).buffer;
                    try { buf = await toAudio(buf, 'mp3'); } catch (convErr) { console.log(`[Song] toAudio failed: ${convErr.message}`); }
                    
                    audioBuffer = buf;
                    audioData = { title: fallback.title || currentVideo.title };
                    chosenVideo = currentVideo;
                    sourcePlatform = `YouTube Scraper (Versi ${idx + 1})`;
                    candidateAttemptLogs.push(`✅ Versi [${idx + 1}] via Scraper: Berhasil`);
                    console.log(`[Song] Scrapr-main fallback succeeded on candidate [${idx + 1}]`);
                    break;
                } catch (scErr) {
                    console.log(`[Song] Scrapr-main failed on candidate [${idx + 1}]: ${scErr.message}`);
                }
            }
        }

        // Validate buffer
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('All download sources failed. The content may be unavailable or blocked.');
        }

        // Kirim thumbnail & status info yang sesuai dengan versi yang berhasil
        const finalTitle = audioData?.title || chosenVideo?.title || 'YouTube Track';
        const finalThumb = chosenVideo?.thumbnail || (chosenVideo?.videoId ? `https://i.ytimg.com/vi/${chosenVideo.videoId}/hqdefault.jpg` : null);
        const logSummary = candidateAttemptLogs.length > 1 ? `\n\n📋 *Riwayat Pencarian:*\n${candidateAttemptLogs.join('\n')}` : '';
        const successCaption = `🎵 *${finalTitle}*\n⏱ Durasi: ${chosenVideo?.timestamp || 'N/A'}\n🌐 Sumber: ${sourcePlatform}${logSummary}`;

        if (finalThumb) {
            try {
                await sock.sendMessage(chatId, { image: { url: finalThumb }, caption: successCaption }, { quoted: message });
            } catch (_) {
                await sock.sendMessage(chatId, { text: successCaption }, { quoted: message });
            }
        } else {
            await sock.sendMessage(chatId, { text: successCaption }, { quoted: message });
        }

        // Send audio
        await sock.sendMessage(chatId, {
            audio: audioBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${(audioData.title || video.title || 'song').replace(/[^\w\s-]/g, '')}.mp3`,
            ptt: false
        }, { quoted: message });
        await sock.sendMessage(chatId, { text: `✅ Selesai! Sumber: ${sourcePlatform}` }, { quoted: message });

    } catch (err) {
        console.error('[Song] Command error:', err.message);
        
        let errorMessage = '❌ Failed to download song.';
        if (err.message && err.message.includes('blocked')) {
            errorMessage = '❌ Download blocked. The content may be unavailable in your region.';
        } else if (err.message && err.message.includes('All download sources failed')) {
            errorMessage = '❌ All download sources failed. Try a different song or use VPN.';
        }
        
        await sock.sendMessage(chatId, { 
            text: errorMessage 
        }, { quoted: message });
    }
}

module.exports = songCommand;