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
• .kick @user — Keluarkan anggota
• .ban @user — Blokir pengguna dari bot
• .unban @user — Buka blokir pengguna
• .promote @user / .demote @user — Atur admin grup
• .mute <menit> / .unmute — Bisukan / buka grup
• .warn @user — Beri peringatan
• .warnings @user — Cek peringatan
• .unwarn @user — Hapus satu peringatan
• .pin — Pin pesan (balas pesan; durasi: 24jam / 7hari / 30hari)
• .unpin — Lepas pin pesan
• .staff — Daftar admin grup (alias: .admins, .listadmin)

⚙️ MODERASI & GRUP
• .antilink on/off — Proteksi tautan
• .antibadword on/off — Filter kata kasar
• .antitag on/off — Blokir tag massal
• .antidelete on/off — Cadangkan pesan terhapus
• .chatbot on/off — Balasan otomatis
• .welcome on/off — Pesan anggota baru
• .goodbye on/off — Pesan anggota keluar
• .mention on/off — Atur notifikasi mention
• .setmention — Atur pesan mention (balas pesan)
• .groupinfo — Info grup (alias: .infogp, .infogrupo)
• .setgname <nama> — Ubah nama grup
• .setgdesc <teks> — Ubah deskripsi grup
• .setgpp — Atur foto grup (balas gambar)
• .grouplock / .groupunlock — Atur izin kirim grup
• .resetlink — Reset tautan undangan (alias: .revoke, .anularlink)

🧰 UTILITAS
• .help / .menu — Tampilkan menu ini (alias: .bot, .list)
• .ping / .alive — Cek status bot
• .delete — Hapus pesan bot (balas pesan; alias: .del)
• .url <balas media> — Media jadi tautan (alias: .tourl)
• .ss <tautan> — Screenshot situs (alias: .ssweb, .screenshot)
• .vv — Buka media sekali lihat (balas pesan)
• .tts <teks> — Teks jadi suara (kode bahasa opsional: .tts en halo)
• .translate <teks> — Terjemahkan teks
• .trt <teks> <bahasa> — Terjemahkan ke bahasa tertentu
• .gpt / .gemini <pertanyaan> — Tanya AI
• .sora <prompt> — Teks jadi video AI
• .lyrics <judul> — Cari lirik lagu
• .weather <kota> — Info cuaca
• .news — Berita top dunia
• .repo / .script — Link repo GitHub bot (alias: .git, .github)
• .jid — Lihat ID grup
• .owner — Info pemilik bot
• .settings — Lihat konfigurasi bot
• .clear — Bersihkan chat

🖼️ STIKER & GAMBAR
• .sticker / .s — Buat stiker (balas media)
• .simage — Ubah stiker menjadi gambar
• .take / .steal <nama paket> — Ganti metadata stiker
• .crop — Potong gambar jadi stiker
• .blur — Blur gambar
• .removebg — Hapus latar belakang (alias: .rmbg, .nobg)
• .remini — Tingkatkan resolusi (alias: .enhance, .upscale)
• .emojimix <emoji>+<emoji> — Gabungkan emoji (alias: .emix)
• .tg <tautan> — Ambil stiker Telegram (alias: .stickertelegram, .tgsticker, .telesticker)
• .brat <teks> — Buat meme Brat

📥 DOWNLOAD
• .play / .song / .music <judul> — Cari dan unduh lagu (alias: .mp3, .ytmp3)
• .video / .ytmp4 <judul/tautan> — Cari dan unduh video YouTube
• .mp4to3 / .mp4tomp3 <tautan> — Video jadi MP3 (bisa balas video)
• .tiktok / .tt <tautan> — Unduh TikTok
• .instagram / .insta / .ig <tautan> — Unduh Instagram
• .igs / .igsc <tautan> — Stiker dari media Instagram
• .twitter / .x <tautan> — Unduh Twitter/X
• .facebook / .fb <tautan> — Unduh Facebook
• .pinterest / .pin <tautan> — Unduh Pinterest
• .threads <tautan> — Unduh Threads
• .reddit <tautan> — Unduh Reddit
• .pixiv <tautan> — Unduh Pixiv
• .rednote / .xhs / .xiaohongshu <tautan> — Unduh RedNote
• .soundcloud <tautan> — Unduh SoundCloud (alias: .sc)
• .douyin <tautan> — Unduh Douyin
• .bilibili <tautan> — Unduh Bilibili
• .bandcamp <tautan> — Unduh Bandcamp
• .terabox <tautan> — Unduh Terabox
• .spotify <tautan> — Info lagu Spotify
• .applemusic / .am <tautan> — Info lagu Apple Music
• .univmp3 / .univmp4 <tautan> — Unduh lintas platform

🎮 FUN & GAME
• .meme — Meme acak
• .joke — Jokes acak
• .quote — Kutipan acak
• .fact — Fakta acak
• .ship @user — Cek kecocokan
• .compliment @user — Pujian
• .insult @user — Ejekan
• .simp / .stupid / .character / .wasted @user — Meme pengguna (alias: .itssostupid, .iss)
• .flirt — Pesan gombal
• .shayari — Puisi shayari (alias: .shayri)
• .goodnight — Pesan selamat malam (alias: .lovenight, .gn)
• .roseday — Pesan roseday

🎭 EFEK & ANIME
• .heart / .horny / .circle / .lgbt / .lolice — Efek gambar
• .simpcard / .tonikawa / .its-so-stupid / .namecard — Kartu & meme
• .oogway / .oogway2 / .tweet / .ytcomment — Gambar teks
• .comrade / .gay / .glass / .jail / .passed / .triggered — Efek gambar
• .animu <aksi> — Aksi anime
• .animuquote — Kutipan anime
• .nom / .poke / .cry / .kiss / .pat / .hug — GIF anime
• .wink / .facepalm / .loli — Konten anime (alias: .face-palm)

🌏 BENDERA NEGARA
• .pies <negara> — Filter bendera
• .china / .indonesia / .japan / .korea — Bendera negara
• .india / .malaysia / .thailand — Bendera negara

👑 OWNER
• .mode public/private — Atur akses bot
• .sudo add/remove @user — Atur pengguna sudo
• .update — Perbarui bot dari repo GitHub
• .setpp — Ganti foto profil bot
• .clearsession — Bersihkan session (alias: .clearsesi)
• .cleartmp — Bersihkan file sementara
• .autoreact on/off — Auto-reaction (alias: .areact, .autoreaction)
• .autostatus on/off — Uploader status otomatis
• .autotyping on/off — Indikator mengetik otomatis
• .autoread on/off — Tandai pesan terbaca otomatis
• .anticall on/off — Tolak panggilan otomatis
• .pmblocker on/off — Blokir chat pribadi
• .pmblocker setmsg <teks> — Atur pesan blokir DM

Semua perintah pakai prefix "." — alias dipisah "/" atau "alias:".`;

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
