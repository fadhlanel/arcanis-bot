const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Convert MP4 video file to MP3 audio using FFmpeg.
 * The function spawns FFmpeg as a child process (no shell) to avoid injection.
 * @param {string} inputPath  Full path to source MP4 file.
 * @param {string} outputPath Full path for resulting MP3 file.
 * @param {object} opts       { timeout?: number }
 * @returns {Promise<void>} Resolves when conversion finishes successfully.
 */
function mp4ToMp3(inputPath, outputPath, opts = {}) {
    return new Promise((resolve, reject) => {
        const timeout = opts.timeout || 120000; // 2 min default
        // Ensure input file exists
        if (!fs.existsSync(inputPath)) return reject(new Error('Input file not found'));
        // Prepare ffmpeg command
        const ffmpeg = spawn('ffmpeg', [
            '-y',               // overwrite output
            '-i', inputPath,    // input file
            '-vn',              // no video
            '-c:a', 'libmp3lame',
            '-q:a', '2',        // high quality VBR
            outputPath
        ]);
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            ffmpeg.kill('SIGKILL');
        }, timeout);
        ffmpeg.stderr.on('data', () => {}); // ignore ffmpeg logs
        ffmpeg.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
        ffmpeg.on('close', code => {
            clearTimeout(timer);
            if (timedOut) return reject(new Error('FFmpeg conversion timeout'));
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });
    });
}

// UA browser dipakai ffmpeg untuk mengakses playlist HLS (SoundCloud).
const STREAM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Convert an HLS playlist (m3u8) into an MP3 audio buffer.
 * ffmpeg streams the decoded audio to stdout — no temp files needed.
 * @param {string} hlsUrl HLS playlist URL (mis. track SoundCloud HLS-only).
 * @param {object} opts   { timeout?: number, maxBytes?: number }
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
function hlsToMp3(hlsUrl, opts = {}) {
    return new Promise((resolve, reject) => {
        const timeout = opts.timeout || 150000; // 2,5 menit default
        const maxBytes = opts.maxBytes || 120 * 1024 * 1024; // batas ±120 MB
        let settled = false;

        const ffmpeg = spawn('ffmpeg', [
            '-nostdin', '-y',
            '-user_agent', STREAM_UA,
            '-i', hlsUrl,
            '-map', '0:a:0',    // ambil track audio pertama
            '-vn',              // abaikan cover art di playlist HLS
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            '-f', 'mp3',
            'pipe:1'
        ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

        const timer = setTimeout(() => {
            try { ffmpeg.kill('SIGKILL'); } catch {}
            failOnce(new Error('FFmpeg HLS conversion timeout'));
        }, timeout);

        function failOnce(err) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(err);
        }

        function passOnce(out) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(out);
        }

        ffmpeg.on('error', err => {
            failOnce(err.code === 'ENOENT'
                ? new Error('ffmpeg tidak tersedia di server; track ini hanya menyediakan format HLS sehingga butuh ffmpeg untuk dikonversi ke MP3')
                : new Error(`ffmpeg error: ${err.message}`));
        });

        const chunks = [];
        let stderrTail = '';
        ffmpeg.stdout.on('data', chunk => {
            if (settled) return;
            chunks.push(chunk);
            if (Buffer.concat(chunks).length > maxBytes) {
                try { ffmpeg.kill('SIGKILL'); } catch {}
                failOnce(new Error(`MP3 hasil konversi terlalu besar (> ${Math.round(maxBytes / 1024 / 1024)} MB)`));
            }
        });
        ffmpeg.stderr.on('data', chunk => {
            stderrTail = (stderrTail + chunk.toString()).slice(-2000);
        });

        ffmpeg.on('close', code => {
            if (settled) return;
            const buffer = Buffer.concat(chunks);
            if (code !== 0 || !buffer.length) {
                const lastErr = stderrTail.trim().split('\n').pop() || 'no stderr output';
                return failOnce(new Error(`ffmpeg HLS→MP3 gagal (code ${code}): ${lastErr}`));
            }
            passOnce({ buffer, contentType: 'audio/mpeg' });
        });
    });
}

module.exports = { mp4ToMp3, hlsToMp3 };
