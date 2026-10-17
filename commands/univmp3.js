const { detectPlatformFromUrl, downloadAndSend, log, scrapeUrl, downloadBuffer } = require('../lib/scraprDownloader');
const { mp4ToMp3 } = require('../lib/ffmpegConvert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ffmpegExists() {
    const res = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
}

async function univmp3Command(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const url = text.replace(/^\.univmp3\s*/i, '').trim();
    if (!url) return sock.sendMessage(chatId, { text: '❌ Penggunaan: .univmp3 <link>' }, { quoted: message });

    const platform = detectPlatformFromUrl(url);
    if (!platform) return sock.sendMessage(chatId, { text: '❌ URL tidak didukung.' }, { quoted: message });

    try {
        await sock.sendMessage(chatId, { text: `⏳ Mencari audio pada ${platform}...` }, { quoted: message });
        // Try direct audio download first
        await downloadAndSend(sock, chatId, message, platform, url, { mediaType: 'audio', singleItem: true });
        return; // success, exit
    } catch (audioErr) {
        log(platform, 'FALLBACK', `audio not found, fallback to video→mp3: ${audioErr.message}`);
        try {
            await sock.sendMessage(chatId, { text: '⚙️ Mengunduh video untuk konversi...' }, { quoted: message });
            const result = await scrapeUrl(platform, url);
            const videoItem = result.downloads.find(d => {
                if (!d.url) return false;
                const type = String(d.type || '').toLowerCase();
                // Anggap video bila tipe mencakup kata "video" atau tidak menyebut "image"
                return type.includes('video') || !type.includes('image');
            }) || result.downloads[0];
            if (!videoItem) throw new Error('Tidak ada video yang dapat diunduh');

            const { buffer: videoBuf } = await downloadBuffer(videoItem.url, { platform, expectedType: 'video' });
            const tmpDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const uid = require('crypto').randomBytes(3).toString('hex');
            const mp4Path = path.join(tmpDir, `${uid}.mp4`);
            const mp3Path = path.join(tmpDir, `${uid}.mp3`);
            fs.writeFileSync(mp4Path, videoBuf);
            await mp4ToMp3(mp4Path, mp3Path);
            const mp3Buf = fs.readFileSync(mp3Path);
            await sock.sendMessage(chatId, { audio: mp3Buf, mimetype: 'audio/mpeg', fileName: `${result.title || 'audio'}.mp3` }, { quoted: message });
        } catch (fallbackErr) {
            log(platform, 'COMMAND_ERROR', `fallback error=${fallbackErr.message}`);
            await sock.sendMessage(chatId, { text: '❌ Gagal konversi video ke audio. Coba link lain.' }, { quoted: message });
        } finally {
            // cleanup temp files if exist
            try { if (fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path); } catch (_) {}
            try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch (_) {}
        }
    }
}

module.exports = univmp3Command;
