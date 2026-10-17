const settings = require('../settings');

async function helpCommand(sock, chatId, message) {
    const helpMessage = `╭─「 ${settings.botName || 'BotGajeJir'} 」
│ v${settings.version || '3.0.7'} · Online
╰──────────────

🛡️ ADMIN
• .tagall — Tag semua anggota
• .hidetag <pesan> — Tag tersembunyi
• .tag <pesan> — Tag dengan pesan
• .tagnotadmin — Tag anggota non-admin
• .ban @user — Blokir pengguna dari bot
• .kick @user — Keluarkan anggota
• .promote / .demote @user — Atur admin
• .mute <menit> / .unmute — Bisukan / buka grup
• .warn @user — Beri peringatan
• .warnings @user — Cek peringatan
• .pin — Pin pesan yang dibalas
• .pin 7hari / .pin 30hari — Pin dengan durasi
• .unpin — Lepas pin pesan

🧰 MODERASI & GRUP
• .antilink on/off — Proteksi tautan
• .antibadword on/off — Filter kata kasar
• .antispam — Proteksi spam
• .antitag on/off — Blokir tag massal
• .antidelete on/off — Cadangkan pesan terhapus
• .chatbot on/off — Balasan otomatis
• .groupinfo — Info grup
• .staff — Daftar admin
• .setgname <nama> — Ubah nama grup
• .setgdesc <teks> — Ubah deskripsi grup
• .setgpp — Atur foto grup (balas gambar)
• .grouplock / .groupunlock — Atur izin grup
• .resetlink — Reset tautan undangan
• .welcome on/off — Pesan anggota baru
• .goodbye on/off — Pesan anggota keluar

🔧 UTILITAS
• .help / .menu — Tampilkan menu ini
• .ping / .alive — Cek status bot
• .delete — Hapus pesan bot (balas pesan)
• .translate <teks> — Terjemahkan teks
• .trt <teks> <bahasa> — Terjemahkan ke bahasa tertentu
• .ai / .gpt / .gemini <pertanyaan> — Tanya AI
• .settings — Lihat konfigurasi bot
• .url — Ubah media menjadi tautan
• .ss <tautan> — Screenshot situs
• .vv — Lihat media sekali lihat
• .jid — Lihat ID grup
• .owner — Info pemilik bot
• .clear — Bersihkan chat

🖼️ STIKER & GAMBAR
• .sticker / .s — Buat stiker (balas media)
• .simage — Ubah stiker menjadi gambar
• .take <nama paket> — Ganti metadata stiker
• .crop — Potong stiker
• .blur — Blur gambar
• .removebg — Hapus latar belakang
• .remini — Tingkatkan kualitas gambar
• .emojimix <emoji>+<emoji> — Gabungkan emoji
• .tgsticker <tautan> — Ambil stiker Telegram

📥 DOWNLOAD
• .play / .song <judul> — Cari dan unduh lagu
• .tiktok / .tt <tautan> — Unduh TikTok
• .instagram / .insta / .ig <tautan> — Unduh Instagram
• .igs <tautan> — Stiker dari media Instagram
• .twitter / .x <tautan> — Unduh Twitter/X
• .facebook / .fb <tautan> — Unduh Facebook
• .ytmp4 <tautan> — Unduh video YouTube
• .video <judul> — Cari dan unduh video
• .pinterest / .pin <tautan> — Unduh Pinterest
• .threads / .thread <tautan> — Unduh Threads
• .reddit <tautan> — Unduh Reddit
• .pixiv <tautan> — Unduh Pixiv
• .rednote / .xhs <tautan> — Unduh RedNote
• .soundcloud / .sc <tautan> — Unduh SoundCloud
• .douyin <tautan> — Unduh Douyin
• .bilibili <tautan> — Unduh Bilibili
• .bandcamp <tautan> — Unduh Bandcamp
• .terabox <tautan> — Unduh Terabox
• .spotify <tautan> — Info Spotify
• .applemusic / .am <tautan> — Info Apple Music
• .univmp3 <tautan> — Unduh audio lintas platform
• .univmp4 <tautan> — Unduh video lintas platform
• .brat <teks> — Buat meme Brat

✨ EFEK TEKS
• .attp <teks> — Teks animasi
• .metallic / .ice / .snow / .neon / .fire <teks> — Efek teks
• .thunder / .glitch / .matrix / .hacker <teks> — Efek teks
• .devil / .purple / .light / .impressive / .leaves <teks> — Efek teks
• .sand / .blackpink / .1917 / .arena <teks> — Efek teks

🎮 FUN & GAME
• .tictactoe @user — Main tic-tac-toe
• .hangman — Tebak kata
• .guess <huruf> — Tebak huruf
• .trivia / .answer <jawaban> — Kuis trivia
• .truth / .dare — Tantangan
• .8ball <pertanyaan> — Tanya bola ajaib
• .topmembers — Anggota paling aktif
• .ship @user — Cek kecocokan
• .compliment / .insult @user — Pujian atau ejekan
• .simp / .stupid / .character / .wasted @user — Meme pengguna
• .flirt / .shayari / .goodnight / .roseday — Pesan hiburan

🎭 EFEK & ANIME
• .heart / .horny / .circle / .lgbt / .lolice — Efek gambar
• .simpcard / .tonikawa / .its-so-stupid / .namecard — Kartu & meme
• .oogway / .oogway2 / .tweet / .ytcomment — Gambar teks
• .comrade / .gay / .glass / .jail / .passed / .triggered — Efek gambar
• .animu <aksi> — Aksi anime
• .nom / .poke / .cry / .kiss / .pat / .hug — GIF anime
• .wink / .facepalm / .loli — Konten anime

🌏 BENDERA NEGARA
• .pies <negara> — Filter bendera
• .china / .indonesia / .japan / .korea — Bendera negara
• .india / .malaysia / .thailand — Bendera negara

👑 OWNER
• .mode public/private — Atur akses bot
• .sudo add/remove @user — Atur pengguna sudo
• .clearsession — Bersihkan session
• .cleartmp — Bersihkan file sementara
• .setpp — Ganti foto profil bot
• .autoreact / .autostatus on/off — Atur otomatisasi
• .autotyping / .autoread on/off — Atur indikator pesan
• .anticall / .pmblocker on/off — Atur blokir panggilan/DM
• .pmblocker setmsg <teks> — Atur pesan blokir DM
• .mention on/off — Atur notifikasi mention
• .setmention — Atur pesan mention (balas pesan)

Kirim nama command tanpa prefix untuk melihat detail.`;

    const maxLength = 3500;
    const lines = helpMessage.split('\n');
    const parts = [];
    let current = '';

    for (const line of lines) {
        if (current.length + line.length + 1 > maxLength && current) {
            parts.push(current);
            current = '';
        }
        current += `${current ? '\n' : ''}${line}`;
    }
    if (current) parts.push(current);

    console.log(`[Menu] Sending ${parts.length} part(s), ${helpMessage.length} chars, chat=${chatId}`);
    for (let index = 0; index < parts.length; index++) {
        try {
            console.log(`[Menu] Sending part ${index + 1}/${parts.length}...`);
            await sock.sendMessage(chatId, { text: parts[index] }, { quoted: index === 0 ? message : undefined });
            console.log(`[Menu] Part ${index + 1}/${parts.length} sent`);
        } catch (error) {
            console.error(`[Menu] Part ${index + 1}/${parts.length} failed:`, error);
            throw error;
        }
    }
}

module.exports = helpCommand;
