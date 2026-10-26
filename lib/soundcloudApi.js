// Resolver SoundCloud via API resmi (api-v2.soundcloud.com).
// Klickaud (vendored scrapr) gagal 403 karena Cloudflare; API SoundCloud masih
// bisa dipakai memakai client_id publik yang diambil menyerupai browser.

const axios = require('axios');

const API_BASE = 'https://api-v2.soundcloud.com';
const CLIENT_ID_TTL = 6 * 60 * 60 * 1000; // 6 jam
const CLIENT_ID_PATTERN = /client_id\s*[:=]\s*["']([a-zA-Z0-9]{32})["']/;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const clientIdCache = { id: null, at: 0 };

function httpDefaults() {
    return { headers: { 'User-Agent': BROWSER_UA, Referer: 'https://soundcloud.com/' }, timeout: 20000 };
}

// Buang parameter tracking & perluas tautan pendek (on.soundcloud.com / snd.sc).
async function normalizeTrackUrl(rawUrl) {
    let out = String(rawUrl || '').trim();
    try {
        const parsed = new URL(out);
        for (const key of [...parsed.searchParams.keys()]) {
            if (/^utm_/i.test(key) || ['lc', 'from', 'src', 'referrer'].includes(key.toLowerCase())) {
                parsed.searchParams.delete(key);
            }
        }
        out = parsed.toString();
        if (/^https?:\/\/(on\.soundcloud\.com|snd\.sc)\//i.test(out)) {
            try {
                const res = await axios.head(out, { ...httpDefaults(), maxRedirects: 0, timeout: 15000, validateStatus: s => s >= 200 && s < 400 });
                if (res.headers?.location) out = new URL(res.headers.location, out).toString();
            } catch {} // gagal expand → coba langsung di resolve
        }
    } catch {}
    return out;
}

// client_id ditemukan di asset JS SoundCloud (page → scripts → regex).
async function fetchClientId() {
    const home = await axios.get('https://soundcloud.com/', { responseType: 'text', validateStatus: s => s === 200, ...httpDefaults() });
    const scripts = [...String(home.data).matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map(m => m[1]);
    if (!scripts.length) throw new Error('Halaman SoundCloud tidak memuat asset JS');

    // Asset konfigurasi biasanya berada di akhir daftar script.
    for (const src of scripts.slice(-8).reverse()) {
        try {
            const js = await axios.get(src, { responseType: 'text', validateStatus: s => s === 200, ...httpDefaults() });
            const found = String(js.data).match(CLIENT_ID_PATTERN);
            if (found) return found[1];
        } catch {}
    }
    throw new Error('client_id SoundCloud tidak ditemukan di asset JS');
}

async function getClientId({ refresh = false } = {}) {
    if (!refresh && clientIdCache.id && Date.now() - clientIdCache.at < CLIENT_ID_TTL) return clientIdCache.id;
    clientIdCache.id = await fetchClientId();
    clientIdCache.at = Date.now();
    return clientIdCache.id;
}

async function resolveEntity(url) {
    let refresh = false;
    for (let attempt = 0; attempt < 2; attempt++) {
        const cid = await getClientId({ refresh });
        const res = await axios.get(`${API_BASE}/resolve`, {
            params: { url, client_id: cid },
            validateStatus: s => s >= 200 && s < 500,
            ...httpDefaults()
        });
        if (res.status === 200) return res.data;
        // client_id bisa kedaluwarsa → tarik client_id baru, lalu coba sekali lagi
        if ((res.status === 401 || res.status === 403) && !refresh) { refresh = true; continue; }
        throw new Error(res.status === 404
            ? 'Track SoundCloud tidak ditemukan / private'
            : `HTTP ${res.status} dari API SoundCloud`);
    }
    throw new Error('HTTP 401 dari API SoundCloud (client_id baru pun ditolak)');
}

const presetBitrate = preset => {
    const match = /(\d+)\s*k/i.exec(String(preset || ''));
    return match ? parseInt(match[1], 10) : 0;
};

function pickTrack(entity) {
    if (entity?.kind === 'track' && entity.id) return { track: entity, label: entity.title || 'SoundCloud' };
    if ((entity?.kind === 'playlist' || entity?.kind === 'system-playlist') && Array.isArray(entity.tracks)) {
        const first = entity.tracks.find(t => t && t.kind === 'track' && t.streamable !== false);
        if (first) return { track: first, label: `${entity.title || 'Playlist'} – ${first.title}` };
        throw new Error('Playlist SoundCloud tidak punya track yang bisa diputar');
    }
    throw new Error(`Tautan bukan track SoundCloud (kind: ${entity?.kind || 'unknown'})`);
}

async function fetchStreamUrl(transcoding, cid) {
    const res = await axios.get(transcoding.url, { params: { client_id: cid }, validateStatus: s => s === 200, ...httpDefaults(), timeout: 30000 });
    return res.data?.url || null;
}

function ok(title, downloads) {
    // type 'audio' wajib: pipeline downloader memvalidasi normalizedType dari sini
    return { status: true, result: { title, type: 'audio', downloads } };
}

async function resolveSoundcloud(rawUrl) {
    const url = await normalizeTrackUrl(rawUrl);
    if (!/^https?:\/\/((?:on\.soundcloud\.com|snd\.sc)|[^/]*soundcloud\.com)\//i.test(url)) {
        throw new Error('URL SoundCloud tidak valid');
    }

    const entity = await resolveEntity(url);
    const { track, label } = pickTrack(entity);
    // Playlist: label sudah berbentuk "Playlist – Track"; track tunggal: judul track
    const title = label || track.title;
    const transcodings = Array.isArray(track.media?.transcodings) ? track.media.transcodings : [];

    // 1) File asli bila tersedia (kualitas terbaik, tanpa konversi)
    if (track.downloadable) {
        try {
            const dl = await axios.get(`${API_BASE}/tracks/${track.id}/download`, {
                params: { client_id: await getClientId() },
                validateStatus: s => s === 200,
                ...httpDefaults()
            });
            if (dl.data?.redirectUri) return ok(title, [{ type: 'audio', url: dl.data.redirectUri, quality: 'original' }]);
        } catch {}
    }

    // 2) Progressive: satu file langsung (biasanya MP3), tidak butuh ffmpeg
    const progressive = transcodings
        .filter(t => t.format?.protocol === 'progressive')
        .sort((a, b) => presetBitrate(b.preset) - presetBitrate(a.preset))[0];
    if (progressive) {
        const streamUrl = await fetchStreamUrl(progressive, await getClientId());
        if (streamUrl) return ok(title, [{ type: 'audio', url: streamUrl, quality: progressive.preset || 'progressive' }]);
    }

    // 3) HLS: butuh ffmpeg di server — dieksekusi otomatis oleh hlsToMp3 di downloader
    const hls = transcodings
        .filter(t => t.format?.protocol === 'hls')
        .sort((a, b) => presetBitrate(b.preset) - presetBitrate(a.preset))[0];
    if (hls) {
        const streamUrl = await fetchStreamUrl(hls, await getClientId());
        if (streamUrl) return ok(title, [{ type: 'audio', url: streamUrl, hls: true, quality: hls.preset || 'hls' }]);
    }

    throw new Error('Tidak ada format audio yang bisa diputar (mungkin track Go+/private)');
}

module.exports = { resolveSoundcloud };
