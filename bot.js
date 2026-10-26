/**
 * BotGajeJir - A WhatsApp Bot
 * Copyright (c) 2024 Professor
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the MIT License.
 * 
 * Credits:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
// Using a lightweight persisted store instead of makeInMemoryStore (compat across versions)
const pino = require("pino")
const readline = require("readline")
const qrcode = require("qrcode-terminal")
const banner = require("./lib/banner")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

// Import lightweight store
const store = require('./lib/lightweight_store')

// Initialize store
store.readFromFile()
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Memory optimization - Force garbage collection if available
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Garbage collection completed')
    }
}, 60_000) // every 1 minute

// Memory monitoring - Restart if RAM gets too high
setInterval(() => {
    const used = process.memoryUsage().rss / 1024 / 1024
    if (used > 400) {
        console.log('⚠️ RAM too high (>400MB), restarting bot...')
        process.exit(1) // Panel will auto-restart
    }
}, 30_000) // check every 30 seconds

let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = settings.botName || "BotGajeJir"
global.themeemoji = "•"

// Banner startup ASCII/ANSI
banner.printStartupBanner({ botName: settings.botName, version: settings.version })

// Auth mode: pairing code adalah default. QR hanya jika diminta secara eksplisit
// (--qr atau PAIRING_MODE=qr). Baileys v7 tidak lagi mencetak QR otomatis,
// sehingga mode QR lama selalu menggantung tanpa bisa di-scan.
const useQrMode = process.argv.includes("--qr") || String(process.env.PAIRING_MODE || '').trim().toLowerCase() === 'qr'

// Pairing code DIPAKSA selalu ARCANISS (Baileys mensyaratkan tepat 8 karakter).
// Tidak ada fallback ke kode random.
const PAIRING_CODE = 'ARCANISS'

// Batas percobaan request pairing code (satu percobaan per rotasi QR)
const MAX_PAIRING_ATTEMPTS = 3

// Only create readline interface if we're in an interactive environment
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // Environment non-interaktif (hosting panel): tidak ada nomor yang bisa diketik
        return Promise.resolve('')
    }
}

const MAX_NUMBER_INPUT_ATTEMPTS = 3

// Nomor bisa diberikan lewat CLI/startup command:
//   npm start -- 6281234567890
//   npm start -- --number=6281234567890
//   npm start -- --number 6281234567890
//   node index.js 6281234567890
function readCliBotNumber(argv = process.argv.slice(2)) {
    for (let i = 0; i < argv.length; i++) {
        const arg = String(argv[i] || '')
        if (arg.startsWith('--number=')) {
            return arg.slice('--number='.length)
        }
        if (arg === '--number' && argv[i + 1]) {
            return argv[i + 1]
        }
        // Positional: argumen pertama yang bentuknya nomor polos
        if (/^\d{7,15}$/.test(arg)) return arg
    }
    return ''
}

// Sumber raw nomor BOT untuk pairing. TIDAK PERNAH memakai ownerNumber —
// akun bot dan akun owner adalah nomor yang berbeda.
// Urutan prioritas: argumen CLI -> env BOT_NUMBER -> settings.botNumber.
function readRawBotNumber() {
    return String(readCliBotNumber() || process.env.BOT_NUMBER || settings.botNumber || '').replace(/\s+/g, '')
}

// Samarkan nomor untuk log (5 pertama + titik + 2 terakhir)
function maskBotNumber(number) {
    const digits = String(number || '')
    if (digits.length < 7) return digits
    return digits.slice(0, 5) + '•'.repeat(Math.max(digits.length - 7, 0)) + digits.slice(-2)
}

// Resolve + validasi nomor BOT. Bila kosong di terminal interaktif,
// tanya ulang sampai valid (maks MAX_NUMBER_INPUT_ATTEMPTS percobaan).
async function resolveBotNumber() {
    let raw = readRawBotNumber()
    let attempts = 0
    while (attempts < MAX_NUMBER_INPUT_ATTEMPTS) {
        const digits = String(raw || '').replace(/[^0-9]/g, '')
        if (!digits && rl) {
            attempts++
            raw = await question(chalk.bgBlack(chalk.greenBright(
                attempts === 1
                    ? 'Masukkan nomor WhatsApp BOT \nFormat: 6281234567890 (tanpa + atau spasi) : '
                    : `Nomor masih kosong. Coba lagi (${attempts}/${MAX_NUMBER_INPUT_ATTEMPTS}) : `
            )))
            continue
        }
        if (!digits) return ''
        if (!PhoneNumber('+' + digits).isValid()) {
            console.log(chalk.red(`Nomor bot tidak valid: ${digits}. Format internasional tanpa + atau spasi, contoh: 6281234567890.`))
            if (!rl) return ''
            attempts++
            raw = await question(chalk.bgBlack(chalk.greenBright(`Nomor tidak valid. Coba lagi (${attempts}/${MAX_NUMBER_INPUT_ATTEMPTS}) : `)))
            continue
        }
        return digits
    }
    return ''
}

// Tawarkan simpan nomor hasil input manual ke .env agar tidak ketik ulang
// saat restart (hanya jika .env/the env belum memuat nomor tersebut).
async function maybeSaveBotNumberEnv(number) {
    if (!rl) return
    if (String(process.env.BOT_NUMBER || '').replace(/[^0-9]/g, '') === number) return
    if (readCliBotNumber()) return // asalnya CLI/startup command — tidak perlu disimpan
    try {
        const answer = String(await question(chalk.bgBlack(chalk.greenBright('Simpan nomor ini ke .env agar tidak ketik ulang saat restart? (y/N): ')))).trim().toLowerCase()
        if (answer !== 'y' && answer !== 'yes') return
        const envPath = join(__dirname, '.env')
        let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
        const line = `BOT_NUMBER=${number}`
        const re = /^[ \t]*BOT_NUMBER[ \t]*=.*$/m
        content = re.test(content)
            ? content.replace(re, line)
            : (content.trim() ? content.trimEnd() + '\n' : '') + line + '\n'
        writeFileSync(envPath, content, 'utf8')
        process.env.BOT_NUMBER = number
        console.log(chalk.green(`💾 Disimpan: BOT_NUMBER=${number} di .env`))
    } catch (err) {
        console.log(chalk.yellow(`Tidak bisa menulis .env: ${err?.message || err}. Set BOT_NUMBER manual.`))
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        // Resolve nomor pairing SEBELUM socket dibuat, agar bot tidak pernah
        // membuka koneksi WhatsApp tanpa nomor akun yang dikonfigurasi.
        let pairingNumber = ''
        if (!useQrMode && !state.creds.registered) {
            if (!readRawBotNumber()) {
                // Banner tampil di tahap "masukkan nomor WhatsApp";
                // di terminal interaktif banner menandai MENUNGGU INPUT, bukan peringatan env.
                banner.printPairingSetup({ botNumber: '', ownerNumber: settings.ownerNumber, interactive: !!rl })
            }
            pairingNumber = await resolveBotNumber()
            if (!pairingNumber) {
                console.log(chalk.red('❌ Nomor WhatsApp BOT belum diisi. Bot tidak membuka koneksi WhatsApp.'))
                if (rl) {
                    console.log(chalk.yellow('1. Jalankan ulang lalu ketik nomornya saat prompt muncul (maks 3 percobaan).'))
                    console.log(chalk.yellow('2. Atau isi BOT_NUMBER di .env / env panel.'))
                } else {
                    console.log(chalk.yellow('1. Terminal ini tidak interaktif (panel/PM2/log runner) — prompt tidak bisa muncul.'))
                    console.log(chalk.yellow('2. Isi BOT_NUMBER di env panel ATAU letakkan nomor di startup command: npm start -- 6281234567890.'))
                }
                console.log(chalk.yellow('3. BOT_NUMBER ≠ OWNER_NUMBER. Jangan isi nomor owner di sini.'))
                return null
            }
            console.log(chalk.cyan('🔑 Pairing code akan dikirim untuk nomor bot:') + ' ' + chalk.green(maskBotNumber(pairingNumber)))
            await maybeSaveBotNumberEnv(pairingNumber)
        } else if (useQrMode) {
            console.log(chalk.yellow('📱 Mode QR aktif. QR akan ditampilkan setelah koneksi siap.'))
        } else {
            console.log(chalk.cyan('✅ Session WhatsApp terdaftar, connect langsung tanpa pairing.'))
        }

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Save credentials when they update
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Message handling
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }
            // In private mode, only block non-group messages (allow groups for moderation)
            // Note: XeonBotInc.public is not synced, so we check mode in main.js instead
            // This check is kept for backward compatibility but mainly blocks DMs
            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Block DMs in private mode, but allow group messages
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Clear message retry cache to prevent memory bloat
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Error in handleMessages:", err)
                // Only try to send error message if we have a valid chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: '❌ An error occurred while processing your message.',
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Error in messages.upsert:", err)
        }
    })

    // Add these event handlers for better functionality
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }

    XeonBotInc.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = XeonBotInc.decodeJid(contact.id)
            if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
        }
    })

    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Connection handling
    // State pairing per socket: kode hanya diminta sekali per sesi,
    // tidak berulang saat QR merotasi atau saat reconnect.
    let pairingAttempts = 0
    let pairingFinished = false
    let pairingBlocked = false

    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s

        if (qr) {
            if (useQrMode) {
                banner.printQrBanner()
                qrcode.generate(qr, { small: true })
            } else if (!XeonBotInc.authState.creds.registered) {
                if (!pairingNumber && !pairingBlocked) {
                    pairingBlocked = true
                    console.log(chalk.red('❌ QR diterima tetapi nomor bot belum diketahui (BOT_NUMBER).'))
                } else if (pairingNumber && !pairingFinished && !pairingBlocked) {
                    if (pairingAttempts >= MAX_PAIRING_ATTEMPTS) {
                        pairingBlocked = true
                        console.log(chalk.red(`❌ Gagal meminta pairing code setelah ${MAX_PAIRING_ATTEMPTS} percobaan. Restart server dan cek BOT_NUMBER.`))
                    } else {
                        pairingAttempts += 1
                        try {
                            // Kode pairing dipaksa ARCANISS
                            const code = await XeonBotInc.requestPairingCode(pairingNumber, PAIRING_CODE)
                            pairingFinished = true
                            banner.printPairingCode(code || PAIRING_CODE, pairingNumber)
                        } catch (error) {
                            console.error('Error requesting pairing code:', error?.message || error)
                            console.log(chalk.red('Gagal meminta pairing code ARCANISS, mencoba lagi saat QR berikutnya muncul.'))
                        }
                    }
                }
            }
        }

        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Connecting to WhatsApp...'))
        }
        
        if (connection == "open") {
            banner.printConnectedBanner(XeonBotInc.user, {
                ownerNumber: settings.ownerNumber,
                version: settings.version,
            })

            try {
                const botNumber = XeonBotInc.user.id.split(':')[0] + '@s.whatsapp.net';
                await XeonBotInc.sendMessage(botNumber, {
                    text: `🤖 Bot Connected Successfully!\n\n⏰ Time: ${new Date().toLocaleString()}\n✅ Status: Online and Ready!`,
                });
            } catch (error) {
                console.error('Error sending connection message:', error.message)
            }

            await delay(1999)
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            console.log(chalk.red(`Connection closed due to ${lastDisconnect?.error}, reconnecting ${shouldReconnect}`))
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('Session folder deleted. Please re-authenticate.'))
                } catch (error) {
                    console.error('Error deleting session:', error)
                }
                console.log(chalk.red('Session logged out. Please re-authenticate.'))
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Reconnecting...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Track recently-notified callers to avoid spamming messages
    const antiCallNotified = new Set();

    // Anticall handler: block callers when enabled
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // First: attempt to reject the call if supported
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Notify the caller only once within a short window
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Anticall is enabled. Your call was rejected and you will be blocked.' });
                    }
                } catch {}
                // Then: block after a short delay to ensure rejection and message are processed
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // ignore
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Error in startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}


// Start the bot with error handling
startXeonBotInc().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Update ${__filename}`))
    delete require.cache[file]
    require(file)
})