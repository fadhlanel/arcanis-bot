const path = require('path');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const AUTH_DIR = path.resolve(__dirname, '..', process.env.AUDIO_STICKER_SESSION_DIR || 'session-audio-sticker');
const CONNECT_TIMEOUT_MS = 90_000;

let modulePromise = null;
let socket = null;
let connected = false;
let connectPromise = null;
const waiters = new Set();

function loadWhatsBibz() {
    if (!modulePromise) modulePromise = import('@xbibzlibrary/whatsbibz');
    return modulePromise;
}

function createSocket() {
    return loadWhatsBibz().then(async (lib) => {
        const { state, saveCreds } = await lib.useMultiFileAuthState(AUTH_DIR);
        const { version } = await lib.fetchLatestWaWebVersion().catch(() => ({ version: undefined }));
        const sock = lib.makeWASocket({
            auth: state,
            version,
            logger: pino({ level: 'fatal' }),
            autoFollowChannel: false,
            printQRInTerminal: false,
        });
        sock.ev.on('creds.update', saveCreds);
        sock.ev.on('connection.update', (update) => {
            if (update.qr) {
                console.log('[Audio Sticker] Scan QR di bawah ini dengan WhatsApp:');
                qrcode.generate(update.qr, { small: true });
            }
            if (update.connection === 'open') {
                connected = true;
                for (const w of waiters) w.resolve(socket);
                waiters.clear();
            }
            if (update.connection === 'close') {
                connected = false;
                socket = null;
                const statusCode = update.lastDisconnect?.error?.output?.statusCode;
                const err = Object.assign(
                    new Error('Koneksi Audio Sticker terputus'),
                    { code: 'AUDIO_SOCKET_DISCONNECTED', statusCode }
                );
                for (const w of waiters) w.reject(err);
                waiters.clear();
            }
        });
        socket = sock;
        return sock;
    });
}

async function waitConnected() {
    if (connected && socket) return socket;
    return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiters.add(waiter);
        const timer = setTimeout(() => {
            if (waiters.delete(waiter)) {
                reject(Object.assign(new Error('QR belum discan dalam batas waktu'), { code: 'AUDIO_SOCKET_QR_PENDING' }));
            }
        }, CONNECT_TIMEOUT_MS);
        timer.unref();
    });
}

async function getAudioStickerSocket() {
    if (connected && socket) return socket;
    if (!connectPromise) {
        connectPromise = createSocket().finally(() => { connectPromise = null; });
    }
    await connectPromise;
    return waitConnected();
}

async function disconnectAudioStickerSocket() {
    if (socket) {
        try { await socket.logout(); } catch {}
        socket = null;
        connected = false;
    }
}

module.exports = {
    getAudioStickerSocket,
    disconnectAudioStickerSocket,
    AUTH_DIR,
    CONNECT_TIMEOUT_MS
};