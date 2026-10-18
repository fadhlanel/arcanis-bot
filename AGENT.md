# AGENT.md — ARCANIS BOT

Panduan kerja universal untuk semua model AI yang mengubah, menganalisis, menguji, atau mengoperasikan project ini.

## 1. Identitas Project

- Nama: ARCANIS BOT / BOTGAJEWA.
- Runtime: Node.js.
- Platform: WhatsApp multi-device.
- Library utama: Baileys.
- Package lokal downloader: `@coflyn/scrapr` dari `scrapr-main`.
- Entry point: `index.js`.
- Router utama: `main.js`.
- Handler command: `commands/`.
- Shared logic: `lib/`.
- Target deployment: Docker/OptikLink dan VPS Node.js.

Baca `PRD.md` sebelum pekerjaan besar.

## 2. Peran Agent

Agent bertindak sebagai operator teknis dan developer:

- Analisis log dan root cause.
- Kenali struktur project sebelum mengubah file.
- Buat rencana untuk perubahan non-trivial.
- Terapkan diff minimum.
- Jalankan validasi setelah perubahan.
- Laporkan file, risiko, dan hasil test.
- Jaga bot tetap stabil saat satu command gagal.

## 3. Aturan Prioritas

Urutan keputusan:

1. Keamanan dan data user.
2. Bot tetap bisa startup.
3. Tidak merusak command existing.
4. Perbaikan root cause, bukan symptom saja.
5. Perubahan paling kecil yang menyelesaikan masalah.
6. Konsistensi dengan pola project existing.
7. Fitur baru hanya jika diminta atau wajib untuk acceptance criteria.

Deletion dan reuse lebih baik daripada duplikasi logic.

## 4. Workflow Wajib

### Sebelum edit

1. Baca request lengkap.
2. Cari handler, router, helper, dan dependency terkait.
3. Baca file sekitar lokasi perubahan.
4. Cek apakah perubahan user lain sedang ada.
5. Identifikasi input, output, fallback, dan error path.
6. Tulis plan singkat jika perubahan menyentuh lebih dari satu fungsi, behavior penting, dependency, data, atau deployment.

### Saat edit

- Edit file paling sedikit.
- Pertahankan style dan CommonJS existing.
- Jangan menambah dependency untuk kebutuhan yang dapat dilakukan stdlib atau helper existing.
- Jangan membuat abstraksi tanpa pemakaian nyata.
- Jangan menghapus data, session, atau konfigurasi tanpa izin eksplisit.
- Validasi input di trust boundary.
- Semua request HTTP wajib punya timeout.
- Semua response external wajib divalidasi sebelum URL atau data dipakai.
- Retry harus terbatas dan memakai backoff.
- Error satu command tidak boleh crash process.

### Setelah edit

1. Jalankan syntax check untuk setiap file JavaScript berubah.
2. Jalankan test atau smoke check yang relevan.
3. Periksa diff.
4. Periksa status repository.
5. Pastikan secret, session, cache, archive, dan dependency hasil install tidak masuk perubahan.
6. Laporkan hasil secara ringkas.

## 5. Commands Penting

Jalankan dari folder `Bot Wa`.

```powershell
node --check commands/<file>.js
node --check lib/<file>.js
npm test
npm start
```

`npm test` saat ini adalah placeholder dan dapat gagal karena project belum memiliki test suite. Jangan menyebut test pass jika hanya syntax check yang pass.

## 6. Struktur dan Source of Truth

- `main.js`: routing command. Cek routing sebelum mengubah alias.
- `commands/song.js`: handler audio utama.
- `commands/play.js`: alias `.play`; jangan duplikasi logic audio.
- `commands/video.js`: handler video.
- `lib/scraprDownloader.js`: orchestration scraper, download buffer, platform detection.
- `lib/converter.js`: FFmpeg conversion untuk audio/video/sticker.
- `scrapr-main/`: implementasi scraper lokal.
- `package.json` dan `package-lock.json`: dependency dan script.
- `session/`, auth data, database lokal, dan temporary files: private/runtime data.

Jika dua command punya behavior sama, gunakan satu handler.

## 7. Downloader Rules

### Audio

- Validasi platform dan URL.
- Dukung YouTube share URL:
  - `youtu.be/<id>?si=...`
  - `youtube.com/watch?v=<id>`
  - `/shorts/<id>`
  - `/embed/<id>`.
- Buang tracking parameter saat mengambil video ID.
- Untuk text search, jangan bergantung buta pada kandidat pertama.
- Kandidat gagal harus dilompati dengan alasan tercatat.
- Download ke buffer, bukan mengirim URL temporary ke WhatsApp.
- Normalisasi dengan `toAudio()` sebelum mengirim jika format source tidak terjamin.
- Kirim `mimetype: 'audio/mpeg'` dan filename aman.

### Video

- Download ke buffer.
- Validasi content type dan ukuran.
- Retry terbatas untuk URL temporary.
- Normalisasi ke MP4 kompatibel WhatsApp melalui `toVideo()` jika codec source tidak terjamin.
- Target codec: H.264 video dan AAC audio.
- Jangan mengirim buffer WebM/VP9/AV1 dengan MIME `video/mp4` tanpa konversi.

### External endpoint

- Anggap endpoint bisa 4xx, 5xx, 429, timeout, response kosong, atau berubah format.
- `downloadUrl: ''` adalah failure.
- Log platform, method, status, duration, dan error; jangan log token.
- Jangan retry tanpa batas.
- Beri fallback yang jelas.

## 8. WhatsApp dan Moderasi

- Validasi hak admin sebelum command admin.
- Validasi bot sendiri sebagai admin sebelum aksi grup.
- Jangan kirim stack trace ke user atau grup.
- Pesan error user singkat dan actionable.
- Jangan mengirim media dua kali.
- Jangan menganggap upload sukses hanya karena URL valid; cek hasil request.

## 9. Security

Jangan commit atau tampilkan:

- `session/`.
- `auth_info/`.
- `.env` dan token.
- API key.
- `baileys_store.json` atau database runtime.
- `node_modules/`.
- `tmp/`, `temp/`, cache, log besar, archive.

Wajib:

- Sanitasi filename dari title/URL.
- Batasi ukuran download dan input.
- Validasi hostname/domain.
- Cegah SSRF ke alamat private/internal.
- Jangan menjalankan shell command dari input user tanpa allowlist.
- Jangan memperbaiki vulnerability dengan `npm audit fix --force` tanpa analisis breaking change.

## 10. Logging

Gunakan format konsisten:

```text
[Downloader][platform][STAGE] key=value
```

Stage umum:

- `VALIDATION`
- `START`
- `SEARCH`
- `SCRAPER`
- `DOWNLOAD`
- `CONVERSION`
- `SEND`
- `SUCCESS`
- `FAILED`

Log boleh berisi request ID, candidate number, HTTP status, size, MIME, dan duration.
Log tidak boleh berisi session, token, nomor lengkap user, atau URL credentialed.

## 11. Git Rules

- Jangan push ke remote tanpa instruksi eksplisit.
- Sebelum commit, jalankan `git status` dan `git diff`.
- Stage file source yang memang berubah saja.
- Jangan stage `node_modules/`, `session/`, `tmp/`, archive, runtime DB, atau secret.
- Gunakan commit message yang menjelaskan behavior:

```text
fix(song): handle unavailable YouTube candidates
fix(video): normalize media for WhatsApp playback
feat(moderation): add group warning command
```

- Setelah push, laporkan commit hash dan file yang masuk.

## 12. Response Format Agent

Gunakan format ringkas:

```text
Analisis:
- symptom
- root cause

Plan:
1. file — perubahan
2. test — validasi

Status:
- changed: ...
- test: ...
- skipped/risk: ...
```

Jika user meminta analisis atau plan, jangan edit file sebelum eksekusi dikonfirmasi.
Jika user meminta eksekusi, lakukan perubahan minimum lalu validasi.
Jika requirement ambigu dan berisiko, tanyakan satu pertanyaan yang paling menentukan.

## 13. Definition of Done

Pekerjaan selesai jika:

- Root cause jelas.
- Scope sesuai request.
- Tidak ada syntax error.
- Error path tertangani.
- Smoke test relevan dijalankan.
- Tidak ada secret/runtime file ikut berubah.
- Alias tidak menduplikasi logic.
- Log cukup untuk mendiagnosis kegagalan berikutnya.
- User menerima ringkasan file berubah dan keterbatasan.
