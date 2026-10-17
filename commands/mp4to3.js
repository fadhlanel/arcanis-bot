const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { mp4ToMp3 } = require('../lib/ffmpegConvert');
const { downloadAndSend, detectPlatformFromUrl, scrapeUrl, downloadBuffer } = require('../lib/scraprDownloader');
const fs = require('fs');
const path = require('path');


/**
 * .mp4to3 command – download a video (any platform) then convert to MP3.
 * Usage: .mp4to3 <link>
 */
async function mp4to3Command(sock, chatId, message) {
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || message.message?.videoMessage?.caption || '';
    const url = text.replace(/^\.mp4to3\s*/i, '').trim();

    // ------- 1️⃣ Cek apakah ada video di pesan atau reply --------
    // Helper untuk dapatkan buffer video dari message/quotedMessage
    async function getVideoBuffer(msg) {
        const videoMsg = msg?.message?.videoMessage || msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;
        if (!videoMsg) return null;
        const stream = await downloadContentFromMessage(videoMsg, 'video');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    }

    let videoBuffer = await getVideoBuffer(message);
    let source = 'url'; // default source

    // Video langsung/reply tidak membutuhkan URL
    if (videoBuffer) source = 'message';
    if (!videoBuffer && !url) {
        return sock.sendMessage(chatId, { text: '❌ Kirim video dengan caption .mp4to3 atau reply video dengan .mp4to3.' }, { quoted: message });
    }

    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const reqId = require('crypto').randomBytes(3).toString('hex');
    const inPath = path.join(tempDir, `${reqId}.mp4`);
    const outPath = path.join(tempDir, `${reqId}.mp3`);

    try {
        let outputTitle = 'audio'; // default
        if (source === 'message') {
            await sock.sendMessage(chatId, { text: '⏳ Mengonversi video dari pesan...' }, { quoted: message });
            fs.writeFileSync(inPath, videoBuffer);
        } else {
            // ------- 3️⃣ Jika tidak, pakai scraping URL (alur lama) -------
            const platform = require('../lib/scraprDownloader').detectPlatformFromUrl(url);
            if (!platform) return sock.sendMessage(chatId, { text: '❌ URL tidak didukung.' }, { quoted: message });

            await sock.sendMessage(chatId, { text: `⏳ Mendownload video dari ${platform}...` }, { quoted: message });
            const result = await require('../lib/scraprDownloader').scrapeUrl(platform, url);
            const videoItem = result.downloads.find(d => d?.url && (d.type === 'video' || /\.mp4/i.test(d.url)));
            if (!videoItem) throw new Error('Tidak ada video yang dapat diunduh');
            const { buffer } = await require('../lib/scraprDownloader').downloadBuffer(videoItem.url, { platform, expectedType: 'video' });
            fs.writeFileSync(inPath, buffer);
            // Simpan judul untuk nama file output (fallback bila tidak ada video source)
            outputTitle = result.title || 'audio';
        }


        // ------- 4️⃣ Konversi ke MP3 -------
        await mp4ToMp3(inPath, outPath);
        const mp3Buf = fs.readFileSync(outPath);
        const fileName = source === 'message' ? 'audio.mp3' : `${outputTitle}.mp3`;
        await sock.sendMessage(chatId, { audio: mp3Buf, mimetype: 'audio/mpeg', fileName }, { quoted: message });
    } catch (error) {
        console.error('[mp4to3]', error.message);
        await sock.sendMessage(chatId, { text: '❌ Gagal konversi MP4 ke MP3. Coba link lain.' }, { quoted: message });
    } finally {
        // Cleanup temp files
        try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath); } catch (_) {}
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (_) {}
    }
}

module.exports = mp4to3Command;
