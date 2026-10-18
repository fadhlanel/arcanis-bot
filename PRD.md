# Product Requirements Document
# ARCANIS BOT / BOTGAJEWA

**Versi dokumen:** 1.0  
**Tanggal:** 2026-10-18  
**Bahasa:** Indonesia  
**Target pembaca:** AI agent operasional dan developer  
**Target runtime:** OptikLink/Docker dan VPS Node.js

---

## 1. Ringkasan Produk

ARCANIS BOT adalah bot WhatsApp multi-device berbasis Node.js dan Baileys. Bot melayani grup dan chat pribadi melalui perintah teks.

Produk mencakup:

- Moderasi grup WhatsApp.
- Downloader media sosial.
- Downloader audio dan video YouTube.
- Sticker dan utilitas media.
- AI dan fitur produktivitas.
- Game dan fitur hiburan.
- Sistem admin, premium, konfigurasi, logging, dan session persistence.

AI agent berperan sebagai operator teknis: memantau error, menganalisis log, menjaga bot tetap berjalan, melakukan perbaikan minimum, menguji perubahan, dan menjaga dokumentasi tetap sinkron.

---

## 2. Tujuan Produk

### Tujuan utama

1. Menyediakan bot WhatsApp serbaguna yang stabil untuk grup dan penggunaan pribadi.
2. Menjalankan perintah media dengan hasil yang dapat diputar atau dibuka di WhatsApp.
3. Menyediakan moderasi grup yang aman dan mudah digunakan admin.
4. Menjaga fallback downloader tetap adaptif terhadap perubahan endpoint eksternal.
5. Membantu AI agent mendiagnosis masalah dari log tanpa menebak-nebak akar masalah.
6. Menjaga deployment berjalan di Docker/panel hosting dan VPS Node.js.

### Tujuan tiga bulan

Semua area memiliki prioritas setara:

- Reliabilitas runtime.
- Keberhasilan downloader.
- Moderasi grup.
- Keamanan dan pengelolaan session.
- Kualitas observability.
- Stabilitas deployment.
- Konsistensi fitur media, AI, game, dan utilitas.

---

## 3. Non-goals

Tidak ada fitur utama yang dinyatakan di luar scope. Setiap pengembangan baru tetap harus memenuhi:

- Tidak merusak command existing.
- Tidak membocorkan credential atau session.
- Tidak mengirim file yang tidak playable.
- Tidak menambah dependency jika kemampuan existing cukup.
- Tidak menambah abstraksi tanpa kebutuhan nyata.

---

## 4. Pengguna dan Peran

### User biasa

- Menjalankan command downloader, media, AI, game, dan utilitas.
- Tidak boleh menjalankan command admin.

### Admin grup

- Menjalankan kick, ban, promote, demote, mute, lock, tag, warning, dan konfigurasi grup.
- Bot harus memvalidasi hak admin sebelum aksi moderasi.

### Owner/operator

- Mengatur deployment, session, environment variable, endpoint, premium, dan debugging.
- Memiliki akses terhadap log operasional tanpa mengekspos secret.

### AI agent

- Membaca struktur project dan log.
- Mengidentifikasi root cause.
- Membuat rencana sebelum perubahan kompleks.
- Menerapkan perubahan minimum.
- Menjalankan syntax check atau test yang relevan.
- Memeriksa diff dan file yang ikut berubah.
- Tidak menghapus data user, session, atau file penting tanpa alasan jelas.
- Push atau tindakan eksternal tetap dicatat dalam changelog operasional.

---

## 5. Arsitektur Produk

```text
WhatsApp user
    ↓
Baileys multi-device
    ↓
main.js command router
    ↓
commands/*.js
    ↓
lib/*.js
    ↓
local package @coflyn/scrapr / scrapr-main
    ↓
external platform or downloader service
```

### Komponen penting

- `main.js` — routing command dan lifecycle bot.
- `index.js` — entry point runtime.
- `commands/` — handler per command.
- `lib/` — shared logic, converter, uploader, downloader, sticker, game, cleanup.
- `scrapr-main/` — local package `@coflyn/scrapr`.
- `data/` — data konfigurasi dan fitur.
- `session/` — credential/session WhatsApp; private.
- `node_modules/` — dependency hasil install; tidak dipush.

---

## 6. Fitur dan Requirement

## 6.1 Command routing

### Requirement

- Router harus mengenali command dengan prefix yang berlaku.
- Alias command harus memakai satu handler bila perilakunya sama.
- Command tidak boleh diproses dua kali.
- Input kosong harus menghasilkan bantuan penggunaan.
- Error handler harus mengirim pesan user-friendly dan menulis detail di log.

### Acceptance criteria

- `.song` dan `.play` memakai logic downloader audio yang sama.
- Alias tidak membuat request ganda.
- Unknown command tidak menyebabkan process crash.

---

## 6.2 Audio downloader: `.song` dan `.play`

### Alur user

```text
User memasukkan judul atau link
    ↓
Deteksi platform
    ↓
Jika judul: cari kandidat YouTube
Jika link Spotify/SoundCloud: gunakan scraper platform
    ↓
Coba downloader utama yang dikonfigurasi
    ↓
Validasi URL dan buffer
    ↓
Normalisasi audio dengan FFmpeg
    ↓
Kirim audio ke WhatsApp
    ↓
Beritahu sumber dan versi yang berhasil
```

### Requirement

- Input judul harus mencari beberapa kandidat, bukan hanya hasil pertama.
- Kandidat harus memiliki video ID valid.
- Link YouTube share harus dipahami:
  - `youtu.be/{id}?si=...`
  - `youtube.com/watch?v={id}&...`
  - `/shorts/{id}`
  - `/embed/{id}`
- Query tracking seperti `si` tidak boleh ikut mengganggu resolusi ID.
- Kandidat gagal dilewati tanpa menghentikan seluruh proses.
- Sistem mencatat kandidat berhasil dan gagal.
- Output menampilkan sumber aktual: API atau scraper.
- Audio dinormalisasi menjadi MP3 playable WhatsApp:
  - 2 channel.
  - 44.1 kHz.
  - 128 kbps minimum target.
  - MIME `audio/mpeg`.
- File audio dikirim sebagai buffer, bukan URL temporary.
- Spotify dan SoundCloud menggunakan scraper yang tersedia; kegagalan harus jelas.

### Acceptance criteria

- `.song shut it down` mencoba kandidat berikutnya jika kandidat pertama unavailable.
- `.play shut it down` menghasilkan perilaku sama dengan `.song shut it down`.
- Audio terkirim dapat diputar di WhatsApp Android dan web.
- Judul file aman untuk filesystem.
- API dengan response `downloadUrl: ""` dianggap gagal dan tidak dikirim.
- Error API tidak membuat bot crash.

---

## 6.3 Video downloader: `.video`

### Alur

```text
User memasukkan judul/link
    ↓
Resolve YouTube video
    ↓
Ambil download URL
    ↓
Download buffer
    ↓
Normalisasi video
    ↓
Kirim MP4 ke WhatsApp
```

### Requirement

- Support pencarian judul dan link YouTube.
- Support pilihan kualitas yang tersedia, minimal 480p dan 720p jika source mendukung.
- Download menggunakan buffer agar URL temporary tidak diberikan langsung ke WhatsApp.
- Retry timeout, temporary failure, dan expired URL secara terbatas.
- Normalisasi ke MP4 kompatibel WhatsApp:
  - H.264 video.
  - AAC audio jika audio tersedia.
  - Container MP4.
- Jangan mengirim buffer mentah dengan MIME MP4 jika codec belum diverifikasi.
- Ukuran file harus dibatasi agar memory server aman.

### Acceptance criteria

- Video yang terkirim dapat diputar di WhatsApp.
- Error `Failed to fetch stream` ditangani tanpa process crash.
- Retry tidak mengirim video duplikat.
- File temporary FFmpeg dibersihkan.

---

## 6.4 Social media downloader

Platform yang didukung mengikuti scraper yang tersedia, termasuk TikTok, Instagram, Facebook, Twitter/X, Pinterest, Threads, Reddit, Pixiv, RedNote, SoundCloud, Spotify, Bandcamp, Apple Music, dan platform lain yang terdaftar di `scraprDownloader.js`.

### Requirement

- Validasi domain sebelum request.
- Deteksi platform harus membedakan domain yang mirip atau tidak terpercaya.
- Media type harus dinormalisasi: image, video, audio, document.
- Pinterest single-image request tidak mengirim thumbnail duplikat.
- Download error per item tidak boleh mematikan item lain jika multi-media.
- Source URL dan method dicatat dalam log tanpa credential.

---

## 6.5 Moderasi grup

### Capability

- Kick, ban, unban.
- Promote, demote.
- Mute, unmute, group lock/unlock.
- Set nama, deskripsi, dan foto grup.
- Tagall, tag, hidetag, tagnotadmin.
- Warning system.
- Anti-spam dan kontrol admin.

### Requirement

- Verifikasi bot admin sebelum aksi admin.
- Verifikasi requester admin/owner sesuai command.
- Target tidak boleh kosong.
- Error WhatsApp API harus dilaporkan tanpa membocorkan stack trace ke grup.
- Data warning dan konfigurasi harus persist.

---

## 6.6 Sticker dan utilitas media

- Convert image/video ke sticker.
- Upload atau download media melalui helper existing.
- FFmpeg failure harus menghasilkan error jelas.
- Temporary file harus dihapus setelah proses.
- Ukuran input harus divalidasi sebelum diproses.

---

## 6.7 AI, game, dan fitur hiburan

- Existing command harus tetap berfungsi setelah perubahan downloader atau router.
- AI command harus memiliki timeout dan error fallback.
- Game harus mencegah state lintas chat tercampur.
- Command hiburan tidak boleh memblokir event loop terlalu lama.

---

## 7. Operasional AI Agent

### Workflow wajib

1. Baca log dan file terkait.
2. Bedakan symptom, root cause, dan dependency failure.
3. Tulis plan untuk perubahan non-trivial.
4. Ubah file sesedikit mungkin.
5. Jalankan `node --check` untuk setiap file JavaScript berubah.
6. Jalankan test atau self-check yang relevan.
7. Periksa `git diff` dan `git status`.
8. Laporkan file berubah, risiko, dan hasil test.

### Aturan perubahan

- Deletion lebih baik daripada duplikasi logic.
- Reuse handler untuk alias command.
- Jangan menambah API eksternal tanpa konfigurasi timeout, validasi response, dan fallback.
- Jangan menaruh token, session, atau credential dalam source.
- Jangan push ke remote tanpa instruksi eksplisit operator.
- Jangan menyentuh `session/`, `node_modules/`, cache, temp, archive, atau database lokal dalam commit source.

---

## 8. Logging dan Observability

Log downloader minimal memiliki:

- Platform.
- Command.
- Request ID.
- Candidate ID atau nomor versi.
- Method.
- Tahap: validation, start, scraper, download, conversion, send, success, failed.
- Durasi.
- Ukuran file.
- Content type.
- HTTP status jika gagal.

Jangan log:

- Credential WhatsApp.
- Token API.
- Isi session.
- Data pribadi penuh user.

Contoh format:

```text
[Downloader][youtube][DOWNLOAD] status=success size=6.47MB contentType=audio/mpeg duration=28337ms
```

---

## 9. Reliabilitas dan Error Handling

### Kategori error

1. **Input error** — URL atau query invalid.
2. **Search error** — tidak ada kandidat.
3. **Source error** — endpoint 4xx/5xx, rate limit, URL kosong.
4. **Stream error** — URL expired, 410, 403, content type salah.
5. **Conversion error** — FFmpeg tidak tersedia atau codec gagal.
6. **WhatsApp send error** — upload/send gagal.
7. **Runtime error** — syntax error, unhandled rejection, process crash.

### Requirement

- Semua external request memiliki timeout.
- Response divalidasi sebelum URL dipakai.
- Retry terbatas, bukan loop tanpa akhir.
- Fallback tidak boleh menyembunyikan error utama.
- Error user-facing singkat; detail ada di server log.
- Process tidak crash akibat satu command gagal.

---

## 10. Security dan Privasi

- Session WhatsApp bersifat rahasia.
- `.env`, token, API key, database lokal, dan file session tidak boleh masuk Git.
- Domain downloader divalidasi sebelum request.
- URL tidak boleh dipakai untuk SSRF ke alamat private/internal.
- File download dibatasi ukuran dan timeout.
- Filename dari user/platform harus disanitasi.
- Command admin harus melakukan authorization check.
- Jangan menjalankan shell command dari input user tanpa allowlist.

---

## 11. Deployment

### OptikLink/Docker

- Bot harus membaca `BOT_JS_FILE` atau entry point yang dikonfigurasi.
- Install dependency harus reproducible dari `package-lock.json`.
- Session dan data persistent harus berada pada volume yang benar.
- Restart loop harus memiliki diagnosis error, bukan hanya restart otomatis.
- Node.js versi deployment harus kompatibel dengan dependency.

### VPS Node.js

- Gunakan process manager seperti PM2/systemd bila dibutuhkan.
- Pisahkan log aplikasi dan log process manager.
- Sediakan mekanisme graceful restart.
- Sediakan backup session/data.

### Health checks

- Process hidup.
- WhatsApp socket tersambung.
- Command sederhana merespons.
- Storage temporary tersedia.
- FFmpeg tersedia jika fitur media aktif.

---

## 12. Data dan Retensi

- Session disimpan hanya untuk kebutuhan koneksi WhatsApp.
- Temporary media dihapus setelah selesai atau saat cleanup berkala.
- Log tidak menyimpan credential.
- Data grup, warning, premium, dan konfigurasi harus memiliki lokasi persist yang jelas.
- Backup sebelum migrasi struktur data.

---

## 13. Testing dan Definition of Done

### Minimal check setiap perubahan

```text
node --check <file-yang-berubah>.js
```

### Test smoke wajib

- `.song <judul>`.
- `.play <judul>`.
- `.song <link YouTube share>`.
- `.video <judul>`.
- `.video <link YouTube>`.
- `.pinterest https://pin.it/...`.
- Satu command moderasi dengan user non-admin.
- Satu command moderasi dengan admin.

### Definition of Done

- Root cause terdokumentasi.
- Plan dan scope jelas.
- Diff minimum dan tidak ada file sampah.
- Syntax check pass.
- Test smoke relevan pass.
- Error handling tersedia.
- Tidak ada secret atau session ikut berubah.
- Changelog/commit menjelaskan perubahan.
- Deployment target tidak crash saat startup.

---

## 14. Roadmap Prioritas Tiga Bulan

### Bulan 1 — Stabilitas dasar

- Hilangkan syntax/runtime crash.
- Audit semua command router.
- Satukan alias command yang duplikat.
- Pastikan audio/video selalu dinormalisasi.
- Tambah smoke check startup dan downloader.
- Audit `.gitignore`, session, temp, dan credential.

### Bulan 2 — Downloader dan observability

- Standardisasi adapter scraper.
- Candidate search dan source reporting.
- Retry dan fallback berbasis kategori error.
- Logging request ID, source, ukuran, durasi, dan status.
- Batasi memory, ukuran file, dan concurrent download.
- Tambah dashboard atau ringkasan error jika kebutuhan meningkat.

### Bulan 3 — Moderasi, keamanan, dan deployment

- Audit authorization semua command admin.
- Hardening SSRF, filename, input, dan file upload.
- Uji Docker/OptikLink dan VPS dari fresh install.
- Backup/restore session dan data.
- Graceful shutdown dan reconnect handling.
- Dokumentasi operasional untuk AI agent dan operator.

---

## 15. Metrik Keberhasilan

Semua kategori dipantau setara:

### Runtime

- Startup tanpa syntax error.
- Tidak ada restart loop berulang.
- Reconnect WhatsApp berhasil.

### Downloader

- Audio dapat diputar di WhatsApp.
- Video dapat diputar di WhatsApp.
- Fallback tidak mengirim duplicate media.
- Error source tidak mematikan bot.

### Moderasi

- Command admin memvalidasi authorization.
- Aksi grup berhasil atau memberi error jelas.
- State warning/config tidak hilang setelah restart.

### Operasional

- Log memiliki request ID dan stage.
- Tidak ada secret dalam log atau commit.
- Temporary files dibersihkan.
- Deployment Docker dan VPS dapat direproduksi.

### Pengalaman pengguna

- Pesan status tidak membingungkan.
- Source dan versi media dilaporkan.
- Error memakai bahasa singkat dan dapat ditindaklanjuti.

---

## 16. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Endpoint eksternal berubah | Downloader gagal | Adapter, validation, fallback, logging |
| Rate limit | Request gagal | Timeout, backoff, circuit breaker terbatas |
| Link temporary expired | Media gagal diambil | Download buffer segera, retry terbatas |
| Codec tidak kompatibel WA | Media tidak bisa diputar | FFmpeg normalize ke MP3/H.264+A​​AC |
| Session bocor | Akun WhatsApp diambil alih | Ignore, secret management, permission ketat |
| File besar | OOM dan crash | Size limit, timeout, concurrency limit |
| YouTube video unavailable | Kandidat gagal | Multi-candidate search dan status jelas |
| Node/dependency mismatch | Startup crash | Lockfile, supported Node version, fresh install test |

---

## 17. Keputusan Produk

- `.song` dan `.play` adalah satu kemampuan audio dengan satu source of truth.
- Link YouTube share harus diproses dengan ekstraksi video ID, bukan diteruskan mentah dengan tracking parameter.
- Downloader harus mengirim buffer hasil validasi/normalisasi.
- External API adalah dependency yang dapat gagal, bukan sumber kebenaran tunggal.
- Scraper lokal dan fallback harus melaporkan status secara eksplisit.
- AI agent mengutamakan diagnosis berbasis log dan perubahan minimum.
