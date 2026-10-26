<div align="center">

<img src="assets/readme/hero.png" alt="ARCANIS BOT — bot WhatsApp multi-device dengan kode pairing tetap ARCANISS" width="100%">

# ARCANIS BOT

**Bot WhatsApp multi-device** untuk moderasi grup, unduhan media, stiker, utilitas AI, dan perintah seru — dibangun di atas [Baileys v7](https://github.com/WhiskeySockets/Baileys) lengkap dengan banner terminal ANSI yang cantik.

[English](README.md) · **Bahasa Indonesia**

</div>

## Daftar Isi

- [Kenapa bot ini](#kenapa-bot-ini)
- [Pratinjau](#pratinjau)
- [Fitur](#fitur)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan bot](#menjalankan-bot)
- [Pairing akun](#pairing-akun)
- [Daftar perintah](#daftar-perintah)
- [Struktur proyek](#struktur-proyek)
- [Troubleshooting](#troubleshooting)
- [Catatan keamanan](#catatan-keamanan)
- [Kredit & lisensi](#kredit--lisensi)

## Kenapa bot ini

- **Kode pairing tetap `ARCANISS`** — tidak perlu pusing screenshot QR. Bot menampilkan kode pairing 8 karakter lewat banner terminal yang rapi; Anda cukup mengetiknya di HP bot.
- **Pengalaman terminal dulu** — logo ARCANIS block-glyph buatan tangan, panel boot, dan panel pairing dengan warna ANSI (bisa dimatikan kapan saja dengan `NO_ANSI=1`).
- **Multi-device (MD)** — berjalan di satu akun WhatsApp khusus bot, sementara nomor personal Anda tetap dipakai normal.
- **Toolkit moderasi serius** — anti-link, anti-spam, anti-delete, sistem warning, tag tools, pengaturan grup, plus permukaan perintah media & utilitas yang luas.
- **Menu anti-terpotong** — menu panjang dipecah otomatis per bagian agar WhatsApp tidak memotongnya.

## Pratinjau

Sekilas banner terminal dan alur pairing:

<table>
  <tr>
    <th width="57%">Terminal — boot + kode pairing</th>
    <th width="43%">WhatsApp — <code>.menu</code></th>
  </tr>
  <tr>
    <td><img src="assets/readme/preview-terminal.png" alt="Banner terminal ARCANIS BOT dengan kode pairing ARCANISS" width="100%"></td>
    <td><img src="assets/readme/preview-menu.png" alt="Chat WhatsApp menu ARCANIS BOT setelah mengirim .menu" width="100%"></td>
  </tr>
</table>

## Fitur

| Kategori | Sorotan |
| --- | --- |
| 🛡️ **Admin** | Tag semua / tag tersembunyi, kick, promote & demote, mute & unmute, warn & cek warning, pin & lepas pin pesan |
| 🧰 **Moderasi** | Anti-link, anti-kata-kasar, anti-spam, anti-tag, cadangan pesan terhapus, info grup, kunci grup, pesan welcome & goodbye |
| 🔧 **Utilitas** | Chat AI (`.ai / .gpt / .gemini`), terjemahan, ubah media jadi tautan, screenshot situs, lihat media view-once, cek JID |
| 🖼️ **Stiker & gambar** | Pembuat stiker, stiker ke gambar, ganti metadata, crop, blur, hapus latar belakang, upscale gambar, emoji mix, ambil stiker Telegram |
| 📥 **Unduhan** | Audio/video YouTube, TikTok, Instagram, Facebook, Twitter/X, Pinterest, Threads, Reddit, SoundCloud, Bilibili, downloader lintas platform |
| 🎮 **Fun & efek** | Meme kecocokan/ship, meme pengguna, aksi anime, efek gambar, filter bendera |
| 👑 **Owner** | Mode public/private, sudo user, bersihkan session, bersihkan file sementara, ganti foto profil, saklar auto-typing/auto-read/auto-react, blokir PM |

<details>
<summary><strong>Kenapa kode pairing tetap?</strong></summary>

Sebagian besar bot Baileys mencetak kode QR yang harus dipindai <em>sebelum kedaluwarsa</em> — ribet di server tanpa layar. Kode pairing hanya <strong>8 karakter yang diketik di HP</strong>, tahan mencoba ulang, dan tidak hangus di tengah jalan. ARCANIS BOT tetap mendukung QR kalau Anda suka: jalankan dengan `--qr` atau `PAIRING_MODE=qr`.

</details>

## Prasyarat

- **Node.js 18+** (disarankan LTS 20 atau 22)
- **npm**
- **Satu akun WhatsApp khusus** untuk bot (nomor "bot"). Harus akun asli terdaftar, terpisah dari nomor pribadi Anda.
- Koneksi internet; sisa ruang ~250 MB setelah `node_modules`.

## Instalasi

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
notepad .env        # isi BOT_NUMBER + OWNER_NUMBER Anda
npm install
```

**Linux / macOS:**

```bash
cp .env.example .env
nano .env           # isi BOT_NUMBER + OWNER_NUMBER
npm install
```

> Di panel hosting terkelola (KataBump, Pterodactyl, dll.) gunakan `npm run install:panel` — menginstal dengan `--legacy-peer-deps` supaya aman dari resolver yang lebih ketat.

## Konfigurasi

Buat `.env` di samping `settings.js`. Semua nilai opsional — `BOT_NUMBER` juga bisa diketik di prompt terminal atau lewat argumen start (lihat [Pairing akun](#pairing-akun)).

| Variabel | Wajib | Deskripsi |
| --- | :---: | --- |
| `BOT_NUMBER` | ➖ | Nomor WhatsApp bot, hanya angka (mis. `62812xxxxxxx`, kode negara di depan, tanpa `+` atau spasi). **Opsional di terminal interaktif** — bot bertanya nomornya saat pairing pertama dan menawarkan menyimpannya ke `.env`. Di panel hosting (console tidak interaktif) wajib: isi di env atau pakai startup command `npm start -- 628…`. |
| `OWNER_NUMBER` | ➖ | Nomor pribadi Anda, hanya angka. Mendapat hak owner di seluruh perintah. |
| `PAIRING_MODE` | ➖ | Isi `qr` untuk pairing lewat QR alih-alih kode pairing tetap. |
| `NO_ANSI` / `NO_COLOR` | ➖ | Isi `1` untuk mencetak banner polos tanpa kode ANSI (berguna untuk panel atau berkas log). |
| `KNIGHTBOT_API_KEY` | ➖ | Kunci untuk helper media/API bawaan (default `knight`). |
| `NEWS_API_KEY` | ➖ | Mengaktifkan fitur berita. |
| `TENOR_API_KEY` | ➖ | Mengaktifkan pencarian GIF Tenor. |
| `GIPHY_API_KEY` | ➖ | Mengaktifkan stiker GIF. |
| `TELEGRAM_BOT_TOKEN` | ➖ | Mengaktifkan sumber stiker Telegram. |
| `GITHUB_REPO` / `GITHUB_BRANCH` | ➖ | Menunjuk repositori untuk helper update/aset. |

Pengaturan lain (nama bot, versi, paket stiker, batas pesan) ada di `settings.js`.

## Menjalankan bot

```bash
npm start
```

atau hemat memori untuk VPS kecil:

```bash
npm run start:optimized
```

Catatan:

- **Banner ANSI**: matikan dengan `NO_ANSI=1 npm start` (bash) atau `$env:NO_ANSI="1"; npm start` (PowerShell).
- Kalau session sudah tersimpan, bot langsung boot dan connect tanpa prompt pairing.
- Start pertama menampilkan banner boot, lalu panel pairing sampai akun terhubung.

## Pairing akun

Mode default memakai kode pairing **`ARCANISS`**:

1. Sediakan nomor bot — salah satu dari ini:
   - **Terminal interaktif**: `npm start`; saat panel pairing tampil `MENUNGGU INPUT`, ketik nomornya (tervalidasi, maks 3 kali). Bot lalu menawarkan menyimpan ke `.env` untuk restart berikutnya.
   - **Startup command / CLI** (tetap jalan di console panel yang tidak interaktif): `npm start -- 6281234567890`, atau `npm start -- --number=6281234567890`.
   - **Environment**: `BOT_NUMBER=6281234567890` di `.env` atau environment variables panel.
2. Panel pairing menampilkan kode tetap:

   <div align="center">

   `「 A R C A N I S S 」`

   </div>

3. Di **HP bot** (akun WhatsApp dengan nomor `BOT_NUMBER`):
   **Settings → Linked Devices → Link a Device → Link with phone number instead**, lalu masukkan `ARCANISS`.
4. Tunggu banner ***Connected!* — session tersimpan** di `session/`, jadi run berikutnya connect otomatis tanpa pairing ulang.

Pindah ke QR dengan `npm start -- --qr` (atau `PAIRING_MODE=qr` di `.env`) bila suka scan.

<details>
<summary><strong>Reset session</strong></summary>

Matikan bot, hapus folder `session/`, hapus juga `baileys_store.json` kalau ingin benar-benar bersih, lalu start ulang dan pairing. Dari WhatsApp Anda juga bisa kirim **`.clearsession`** (khusus owner).

> Kalau bot berjalan di panel terkelola yang menyimpan salinan `session/` sendiri, hapus foldernya juga dari file manager panel — menghapus lokal saja tidak cukup.

</details>

## Daftar perintah

Semua perintah berprefix `.`. Kirim **`.help`** atau **`.menu`** di chat untuk daftar lengkap.

**Admin & moderasi** *(admin grup)*

| Perintah | Efek |
| --- | --- |
| `.tagall` / `.hidetag <pesan>` | Mention semua anggota (terlihat / tersembunyi) |
| `.kick @user` · `.promote` / `.demote @user` | Kelola anggota & status adminnya |
| `.mute <menit>` / `.unmute` · `.grouplock` / `.groupunlock` | Bekukan / buka grup untuk semua kecuali admin |
| `.warn @user` / `.warnings @user` | Sistem warning dengan penyimpanan |
| `.antilink on/off` · `.antispam` · `.antibadword on/off` · `.antidelete on/off` | Saklar moderasi otomatis |
| `.welcome on/off` · `.goodbye on/off` · `.setgname` · `.setgdesc` · `.setgpp` | Identitas grup & pengumuman anggota |
| `.pin` / `.unpin` · `.resetlink` · `.groupinfo` | Pin pesan, reset tautan undangan, info grup |

**Utilitas & media**

| Perintah | Efek |
| --- | --- |
| `.ai / .gpt / .gemini <pertanyaan>` | Tanya asisten AI |
| `.translate <teks>` / `.trt <teks> <bahasa>` | Terjemahkan teks |
| `.play / .song <judul>` · `.video <judul>` · `.ytmp4 <tautan>` | Cari & unduh musik/video |
| `.tiktok` `.instagram` `.facebook` `.twitter/X` `.pinterest` `.threads` `.reddit` `.soundcloud` | Downloader per platform via tautan |
| `.univmp3` / `.univmp4 <tautan>` | Downloader audio/video lintas platform |
| `.sticker` / `.s` · `.simage` · `.take <paket>` · `.crop` · `.blur` | Peralatan stiker & gambar |
| `.removebg` · `.remini` · `.emojimix` · `.url` · `.ss <tautan>` · `.vv` | Utilitas gambar & web |

**Fun, owner & lainnya**

| Perintah | Efek |
| --- | --- |
| `.ship @user` · `.compliment` / `.insult @user` · `.wasted @user` · aksi anime & efek gambar | Perintah hiburan |
| `.mode public/private` · `.sudo add/remove @user` · `.clearsession` · `.cleartmp` · `.setpp` | Administrasi owner |
| `.autoread` / `.autotyping` / `.autoreact` · `.pmblocker` · `.anticall` · `.mention` | Saklar perilaku bot (owner) |
| `.ping` / `.alive` · `.settings` · `.jid` · `.owner` · `.delete` · `.clear` | Info serba-serbi & housekeeping |

## Struktur proyek

```
arcanis-bot-main/
├── index.js             # Titik masuk — banner, logika pairing, penanganan koneksi
├── settings.js          # Konfigurasi dasar (nama bot, versi, fallback owner, packname)
├── commands/            # Satu modul per perintah (100+)
│   ├── help.js          #   renderer .help / .menu
│   └── ...
├── lib/                 # Helper inti
│   ├── banner.js        #   Banner terminal ANSI (logo block-glyph ARCANIS, panel boot/pairing)
│   ├── antilink.js      #   penegakan tautan
│   ├── sticker.js       #   pipeline media → stiker
│   └── ...
├── data/                # State JSON (anti-delete, autoread, hitung pesan, ...)
├── assets/              # Gambar, aset stiker, pratinjau README
│   └── readme/          #   hero + PNG pratinjau untuk README
├── scrapr-main/         # Modul downloader lokal
├── session/             # Dibuat saat pairing pertama — kredensial, jangan di-commit
└── baileys_store.json   # Indeks chat/pesan
```

## Troubleshooting

| Gejala | Kemungkinan penyebab & solusi |
| --- | --- |
| Banner muncul tapi tidak connect | `BOT_NUMBER` kosong — isi di `.env`, hanya angka. |
| "Connection closed / 401" atau reconnect tanpa henti | Session basi: matikan bot, hapus `session/`, start dan pairing ulang. |
| Kode pairing tercetak tapi ditolak | Pastikan memasukkan kode di **HP bot**, **dalam jendela waktu yang tertera**, dan nomornya tidak sedang login di tempat lain (sesi WhatsApp web ikut dihitung). |
| Banner tampil karakter aneh | Log Anda membuang ANSI: set `NO_ANSI=1` atau `NO_COLOR=1`. |
| QR tidak muncul / jendela scan hangus | QR itu opt-in: `npm start -- --qr` atau `PAIRING_MODE=qr`. |
| `npm install` gagal di panel/VPS | Coba `npm run install:panel`. Node LTS (20/22) menghindari sebagian besar masalah build. |
| Perintah downloader balasan kosong | Banyak sumber eksternal throttle atau ganti API; coba tautan/platform lain. |

## Catatan keamanan

- **Jangan pernah membagikan atau commit `session/`** — folder itu berisi kredensial WhatsApp bot. Siapa pun yang memilikinya bisa mengendalikan bot.
- Kode pairing tetap (`ARCANISS`) demi kenyamanan. Aman untuk bot pribadi selama hanya Anda yang bisa membaca terminal — kode itu memang tak berguna tanpa akses ke HP bot.
- Downloader bergantung pada layanan pihak ketiga yang bisa berubah atau hilang; hormati ketentuan tiap platform dan hanya unduh konten yang Anda berhak atasnya.
- Fitur AI dan stiker memanggil API eksternal — perhatikan kuota dan implikasi privasinya saat dipakai di grup.
- Gunakan untuk moderasi dan hiburan yang wajar. Proyek ini **tidak berafiliasi dengan WhatsApp atau Meta**.

## Kredit & lisensi

- Dibangun di atas pustaka WebSocket [Baileys](https://github.com/WhiskeySockets/Baileys) dan ekosistem bot WhatsApp open-source yang lebih luas.
- Banner terminal, alur kode pairing, dan dokumentasi ini: dikemas khusus untuk ARCANIS BOT.

Dirilis di bawah lisensi **MIT** — lihat [LICENSE](LICENSE).
