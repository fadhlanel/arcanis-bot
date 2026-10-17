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

module.exports = { mp4ToMp3 };
