/**
 * lib/banner.js — ASCII/ANSI terminal banner untuk ARCANIS BOT.
 * Tidak butuh dependency baru; memakai chalk yang sudah terpasang.
 *
 * - `NO_ANSI=1` atau `NO_COLOR=1` menonaktifkan warna.
 * - Level warna dipaksa 3 (truecolor) agar tetap berwarna di console panel
 *   (stdout panel biasanya bukan TTY, jadi chalk default mematikan warna).
 */
const chalk = require('chalk')

const NO_ANSI = String(process.env.NO_ANSI || '') !== '' || String(process.env.NO_COLOR || '') !== ''
const ansi = new chalk.Instance({ level: NO_ANSI ? 0 : 3 })

// ---- Font blok: 5 baris per glyph, lebar kolom konsisten per glyph ----
const GLYPHS = {
    A: [
        ' ████ ',
        '██  ██',
        '██████',
        '██  ██',
        '██  ██',
    ],
    R: [
        '█████ ',
        '██  ██',
        '█████ ',
        '██ ██ ',
        '██  ██',
    ],
    C: [
        ' ████ ',
        '██    ',
        '██    ',
        '██    ',
        ' ████ ',
    ],
    N: [
        '██  ██',
        '███ ██',
        '██ ███',
        '██  ██',
        '██  ██',
    ],
    I: [
        '██████',
        '  ██  ',
        '  ██  ',
        '  ██  ',
        '██████',
    ],
    S: [
        ' █████',
        '██    ',
        ' ████ ',
        '    ██',
        '█████ ',
    ],
}

// ---- Gradient cyan → biru → ungu ----
const STOPS = [
    [0, 229, 255],
    [56, 120, 255],
    [168, 85, 247],
]

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
}

function lerp(a, b, t) {
    return a + (b - a) * t
}

function hex2(n) {
    return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
}

function gradient(t) {
    const x = clamp(t, 0, 1)
    const seg = x * (STOPS.length - 1)
    const i = Math.min(STOPS.length - 2, Math.floor(seg))
    const f = seg - i
    const c1 = STOPS[i]
    const c2 = STOPS[i + 1]
    return ansi.hex(`#${hex2(lerp(c1[0], c2[0], f))}${hex2(lerp(c1[1], c2[1], f))}${hex2(lerp(c1[2], c2[2], f))}`)
}

// Render teks jadi array 5 baris ASCII blok
function logoRows(text) {
    const chars = String(text || 'ARCANIS').toUpperCase().split('')
    const rows = ['', '', '', '', '']
    for (const ch of chars) {
        const glyph = GLYPHS[ch]
        if (!glyph) {
            for (let r = 0; r < 5; r++) rows[r] += (r === 2 ? ` ${ch}  ` : '    ')
        } else {
            for (let r = 0; r < 5; r++) rows[r] += glyph[r] + ' '
        }
    }
    return rows
}

// Warnai logo per karakter dengan gradient horizontal
function paintLogo(text) {
    const rows = logoRows(text)
    const width = rows[2].length
    return rows.map((row) => {
        let out = ''
        for (let x = 0; x < row.length; x++) {
            const ch = row[x]
            if (ch === ' ') {
                out += ' '
                continue
            }
            out += gradient(x / width)(ch)
        }
        return out
    })
}

// Kotak info berdingding: border ungu, label cyan, isi terang
function panel(title, pairs) {
    const border = ansi.hex('#8b5cf6')
    const titleC = ansi.bold.hex('#22d3ee')
    const labelC = ansi.bold.hex('#7dd3fc')
    const valueC = ansi.whiteBright

    const contentWidth = Math.max(
        title.length + 3,
        44,
        ...pairs.map(([label, value]) => label.length + 2 + String(value).length),
    )

    const dashes = Math.max(0, contentWidth - title.length - 3)
    const top = border('╭─ ') + titleC(title) + border(' ' + '─'.repeat(dashes) + '╮')
    const bottom = border('╰' + '─'.repeat(contentWidth) + '╯')

    const lines = [top]
    for (const [label, rawValue] of pairs) {
        const value = String(rawValue ?? '-')
        const used = label.length + 2 + value.length
        const pad = ' '.repeat(Math.max(0, contentWidth - used))
        lines.push(border('│ ') + labelC(label) + border(': ') + valueC(value) + pad + border(' │'))
    }
    lines.push(bottom)
    return lines
}

function timestamp() {
    try {
        return new Date().toLocaleString('id-ID')
    } catch (_) {
        return new Date().toISOString()
    }
}

// ---- Banner publik -------------------------------------------------------

function printStartupBanner(info = {}) {
    const rows = [...paintLogo('ARCANIS'), '']
    rows.push(...panel('ARCANIS BOT · BOOT', [
        ['Status', 'MENYALA'],
        ['Nama', info.botName || 'ARCANIS BOT'],
        ['Versi', info.version || '-'],
        ['Node', process.version],
        ['Waktu', timestamp()],
    ]))
    console.log('\n' + rows.join('\n'))
}

function printPairingSetup({ botNumber = '', ownerNumber = '' } = {}) {
    const rows = [...paintLogo('ARCANIS'), '']
    rows.push(...panel('PAIRING WHATSAPP', [
        ['Mode', 'PAIRING CODE'],
        ['Kode', 'ARCANISS'],
        ['Nomor Bot', botNumber ? `+${botNumber}` : 'BELUM DISET'],
        ['Nomor Owner', ownerNumber ? `+${ownerNumber}` : '-'],
        ['Waktu', timestamp()],
    ]))
    if (!botNumber) {
        rows.push('', ansi.yellow('⚠ Nomor WhatsApp BOT belum diset. Isi BOT_NUMBER di env/panel lalu restart.'))
    }
    console.log('\n' + rows.join('\n'))
}

function printPairingCode(code, number) {
    const text = String(code || 'ARCANISS').toUpperCase()
    const spaced = text.split('').join(' ')
    const rows = [...paintLogo('ARCANIS'), '']
    rows.push(...panel('PAIRING CODE SIAP', [
        ['Kode', text],
        ['Nomor Bot', number ? `+${number}` : '-'],
        ['Waktu', timestamp()],
    ]))
    rows.push('')
    rows.push(ansi.bold.hex('#22d3ee')(`「 ${spaced} 」`))
    rows.push('')
    rows.push(ansi.whiteBright('Cara memasukkan di HP akun nomor BOT:'))
    rows.push(ansi.gray('  1. Buka WhatsApp di HP nomor BOT'))
    rows.push(ansi.gray('  2. Settings > Linked Devices > Link a Device'))
    rows.push(ansi.gray('  3. Pilih "Link with phone number instead"'))
    rows.push(ansi.gray(`  4. Masukkan kode: ${text}`))
    console.log('\n' + rows.join('\n'))
}

function printQrBanner() {
    const rows = [...paintLogo('ARCANIS'), '']
    rows.push(...panel('MODE QR', [
        ['Status', 'QR SIAP DI-SCAN'],
        ['Cara', 'WhatsApp > Linked Devices > Link a Device'],
        ['Waktu', timestamp()],
    ]))
    rows.push('')
    rows.push(ansi.whiteBright('Scan QR di bawah ini:'))
    console.log('\n' + rows.join('\n'))
}

function printConnectedBanner(user = {}, info = {}) {
    const botJid = user && user.id ? String(user.id) : ''
    const botNumber = botJid.split(':')[0].replace(/@.*/, '')
    const rows = [...paintLogo('ARCANIS'), '']
    rows.push(...panel('STATUS: ONLINE', [
        ['Status', 'TERHUBUNG'],
        ['Bot', botNumber ? `+${botNumber}` : '-'],
        ['Nama', user.name || user.notify || 'WhatsApp Bot'],
        ['Owner', info.ownerNumber ? `+${info.ownerNumber}` : '-'],
        ['Versi', info.version || '-'],
        ['Waktu', timestamp()],
    ]))
    console.log('\n' + rows.join('\n'))
}

module.exports = {
    printStartupBanner,
    printPairingSetup,
    printPairingCode,
    printQrBanner,
    printConnectedBanner,
}
