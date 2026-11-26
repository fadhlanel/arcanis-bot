/**
 * ikyyDownloader — Unified downloader using api.ikyyxd.my.id
 * Supports: YouTube (audio/video), Spotify, Instagram, All-in-One
 */

const axios = require('axios');

const BASE_API = 'https://api.ikyyxd.my.id';

/**
 * All-in-One Downloader (auto-detect platform)
 * @param {string} url - Any supported URL (YouTube, Spotify, Instagram, etc.)
 * @returns {Promise<Object>}
 */
async function allInOne(url) {
    try {
        const { data } = await axios.get(`${BASE_API}/download/all-in-one`, {
            params: { url },
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        if (!data || !data.status) {
            throw new Error(data?.message || 'All-in-one API returned invalid response');
        }

        return {
            success: true,
            platform: data.platform || 'unknown',
            title: data.result?.title || data.title,
            downloadUrl: data.result?.downloadUrl || data.downloadUrl || data.url,
            metadata: data.result || data
        };
    } catch (err) {
        throw new Error(`All-in-one download failed: ${err.message}`);
    }
}

/**
 * YouTube MP3 Downloader
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>}
 */
async function ytmp3(url) {
    try {
        const { data } = await axios.get(`${BASE_API}/download/ytmp3`, {
            params: { url },
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!data || !data.status) {
            throw new Error(data?.message || 'ytmp3 API returned invalid response');
        }

        return {
            success: true,
            title: data.result?.title || data.title,
            downloadUrl: data.result?.audio?.url || data.result?.downloadUrl || data.downloadUrl,
            thumbnail: data.result?.thumbnail || data.thumbnail,
            duration: data.result?.duration || data.duration,
            metadata: data.result || data
        };
    } catch (err) {
        throw new Error(`ytmp3 download failed: ${err.message}`);
    }
}

/**
 * YouTube MP4 Downloader
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>}
 */
async function ytmp4(url) {
    try {
        const { data } = await axios.get(`${BASE_API}/download/ytmp4`, {
            params: { q: url },
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!data || !data.status) {
            throw new Error(data?.message || 'ytmp4 API returned invalid response');
        }

        return {
            success: true,
            title: data.result?.title || data.title,
            downloadUrl: data.result?.downloadUrl || data.downloadUrl,
            thumbnail: data.result?.thumbnail || data.thumbnail,
            quality: data.result?.quality || data.quality,
            metadata: data.result || data
        };
    } catch (err) {
        throw new Error(`ytmp4 download failed: ${err.message}`);
    }
}

/**
 * Spotify Downloader (using embedded SpotifyDL class logic, adapted for Node.js https module)
 * @param {string} spotifyUrl - Spotify track URL
 * @returns {Promise<Object>}
 */
async function spotify(spotifyUrl) {
    const BASE = 'spotifydown.net';
    
    const request = (method, path, body = null) => {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const fakeIP = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.');
            const data = body ? JSON.stringify(body) : null;

            const options = {
                hostname: BASE,
                path: path,
                method: method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Origin': 'https://spotifydown.net',
                    'Referer': 'https://spotifydown.net/',
                    'X-Forwarded-For': fakeIP,
                    'X-Real-IP': fakeIP,
                    'True-Client-IP': fakeIP
                }
            };

            if (data) {
                options.headers['Content-Type'] = 'application/json';
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }

            const req = https.request(options, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch {
                        reject(new Error('Invalid JSON response'));
                    }
                });
            });

            req.on('error', reject);
            if (data) req.write(data);
            req.end();
        });
    };

    try {
        const meta = await request('GET', `/api/spotify/?url=${encodeURIComponent(spotifyUrl)}`);

        if (!meta || !meta.title) {
            throw new Error('Gagal mengambil metadata Spotify');
        }

        const idRes = await request('POST', '/api/get-id/', {
            title: meta.title,
            artist: meta.artist
        });

        if (!idRes.success || !idRes.videoId) {
            throw new Error('Gagal menemukan videoId');
        }

        const dlRes = await request('POST', '/api/download/', {
            videoId: idRes.videoId,
            candidateIds: [],
            format: "mp3",
            title: `${meta.artist} - ${meta.title}`
        });

        if (!dlRes.success || !dlRes.downloadUrl) {
            throw new Error('Gagal mendapatkan link download');
        }

        return {
            success: true,
            title: meta.title,
            artist: meta.artist,
            album: meta.album || null,
            duration: meta.duration,
            cover: meta.cover,
            downloadUrl: dlRes.downloadUrl,
            mediaUrl: dlRes.mediaUrl,
            metadata: {
                videoId: idRes.videoId,
                filename: dlRes.filename,
                spotifyUrl: meta.spotifyUrl
            }
        };

    } catch (err) {
        throw new Error(`Spotify download failed: ${err.message}`);
    }
}

/**
 * Download buffer dari URL
 * @param {string} url - Direct download URL
 * @param {Object} options - { timeout, maxSize }
 * @returns {Promise<Buffer>}
 */
async function downloadBuffer(url, options = {}) {
    const timeout = options.timeout || 120000;
    const maxSize = options.maxSize || 100 * 1024 * 1024; // 100MB default

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout,
            maxContentLength: maxSize,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        return Buffer.from(response.data);
    } catch (err) {
        throw new Error(`Failed to download buffer: ${err.message}`);
    }
}

module.exports = {
    allInOne,
    ytmp3,
    ytmp4,
    spotify,
    downloadBuffer
};
