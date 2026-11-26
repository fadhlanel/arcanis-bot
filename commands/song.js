const axios = require('axios');
const yts = require('yt-search');
const { toAudio } = require('../lib/converter');
const ikyyDL = require('../lib/ikyyDownloader');

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

        // === SPOTIFY HANDLER ===
        if (isSpotify) {
            await sock.sendMessage(chatId, { text: `⏳ Mengambil audio dari Spotify...` }, { quoted: message });
            try {
                const result = await ikyyDL.spotify(text);
                console.log(`[Song] Spotify download URL obtained: ${result.downloadUrl}`);
                
                const buffer = await ikyyDL.downloadBuffer(result.downloadUrl, { timeout: 120000 });
                await sock.sendMessage(chatId, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${result.artist} - ${result.title}.mp3`.replace(/[^\w\s-]/g, ''),
                    ptt: false
                }, { quoted: message });
                await sock.sendMessage(chatId, { text: `✅ Selesai!\n🎵 ${result.title}\n🎤 ${result.artist}\n💿 Sumber: SPOTIFY` }, { quoted: message });
            } catch (e) {
                console.error(`[Song] Spotify error:`, e.message);
                await sock.sendMessage(chatId, { text: `❌ Gagal download dari Spotify: ${e.message}` }, { quoted: message });
            }
            return;
        }

        // === SOUNDCLOUD HANDLER (fallback ke all-in-one) ===
        if (isSoundCloud) {
            await sock.sendMessage(chatId, { text: `⏳ Mengambil audio dari SoundCloud...` }, { quoted: message });
            try {
                const result = await ikyyDL.allInOne(text);
                console.log(`[Song] SoundCloud download URL obtained: ${result.downloadUrl}`);
                
                const buffer = await ikyyDL.downloadBuffer(result.downloadUrl, { timeout: 120000 });
                await sock.sendMessage(chatId, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    fileName: `${result.title || 'soundcloud'}.mp3`.replace(/[^\w\s-]/g, ''),
                    ptt: false
                }, { quoted: message });
                await sock.sendMessage(chatId, { text: `✅ Selesai! Sumber: SOUNDCLOUD` }, { quoted: message });
            } catch (e) {
                console.error(`[Song] SoundCloud error:`, e.message);
                await sock.sendMessage(chatId, { text: `❌ Gagal download dari SoundCloud: ${e.message}` }, { quoted: message });
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

        await sock.sendMessage(chatId, { text: `🔎 Mencari audio terbaik...` }, { quoted: message });

        let audioBuffer = null;
        let audioData = null;
        let chosenVideo = null;

        // === TRY IKYY API YTMP3 FIRST (RAM-efficient, returns direct URL) ===
        for (let idx = 0; idx < candidates.length; idx++) {
            const currentVideo = candidates[idx];
            const ytUrl = currentVideo.videoId ? `https://youtu.be/${currentVideo.videoId}` : currentVideo.url;
            
            console.log(`[Song] Trying ikyyxd ytmp3 API on candidate [${idx + 1}/${candidates.length}]: "${currentVideo.title}"`);
            
            try {
                const result = await ikyyDL.ytmp3(ytUrl);
                console.log(`[Song] ikyyxd ytmp3 success: ${result.downloadUrl}`);
                
                audioBuffer = await ikyyDL.downloadBuffer(result.downloadUrl, { timeout: 90000, maxSize: 50 * 1024 * 1024 });
                audioData = { title: result.title || currentVideo.title };
                chosenVideo = currentVideo;
                
                console.log(`[Song] ✓ Downloaded ${audioBuffer.length} bytes from ikyyxd API`);
                break;
            } catch (ytErr) {
                console.log(`[Song] ikyyxd ytmp3 failed on candidate [${idx + 1}]: ${ytErr.message}`);
            }
        }

        // Fallback scrapr setelah semua URL ikyyxd gagal diunduh
        if (!audioBuffer || audioBuffer.length === 0) {
            for (let idx = 0; idx < candidates.length; idx++) {
                const currentVideo = candidates[idx];
                const ytUrl = currentVideo.videoId ? `https://youtu.be/${currentVideo.videoId}` : currentVideo.url;
                try {
                    console.log(`[Song] Trying scrapr fallback [${idx + 1}/${candidates.length}]: ${ytUrl}`);
                    const result = await ikyyDL.scraprYouTubeFallback(ytUrl);
                    audioBuffer = await ikyyDL.downloadBuffer(result.downloadUrl, { timeout: 120000, maxSize: 100 * 1024 * 1024 });
                    audioData = { title: result.title || currentVideo.title };
                    chosenVideo = currentVideo;
                    console.log(`[Song] scrapr fallback success on candidate [${idx + 1}]`);
                    break;
                } catch (scraprErr) {
                    console.log(`[Song] scrapr fallback failed on candidate [${idx + 1}]: ${scraprErr.message}`);
                }
            }
        }

        // Validate buffer
        if (!audioBuffer || audioBuffer.length === 0) {
            throw new Error('Gagal download audio. Semua downloader gagal.');
        }

        // Kirim thumbnail & info
        const finalTitle = audioData?.title || chosenVideo?.title || 'YouTube Track';
        const finalThumb = chosenVideo?.thumbnail || (chosenVideo?.videoId ? `https://i.ytimg.com/vi/${chosenVideo.videoId}/hqdefault.jpg` : null);
        const successCaption = `🎵 *${finalTitle}*\n⏱ Durasi: ${chosenVideo?.timestamp || 'N/A'}\n🌐 Sumber: ikyyxd API`;

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
            fileName: `${finalTitle.replace(/[^\w\s-]/g, '')}.mp3`,
            ptt: false
        }, { quoted: message });
        await sock.sendMessage(chatId, { text: `✅ Selesai!` }, { quoted: message });

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