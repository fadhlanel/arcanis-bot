# ARCANIS BOT

<div align="center">
  <img src="https://readme-typing-svg.demolab.com?font=Ribeye&size=50&pause=1000&color=8A2BE2&center=true&vCenter=true&width=900&height=100&lines=ARCANIS+BOT;WhatsApp+Multi-Device+Bot;Baileys+Powered" alt="ARCANIS BOT" />
</div>

<div align="center">

WhatsApp multi-device bot for group moderation, media tools, social downloader, stickers, AI, and games.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Baileys](https://img.shields.io/badge/Baileys-Multi--Device-25D366?style=flat-square&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

</div>

## Features

- Group moderation: kick, promote, demote, mute, tag, anti-link, anti-tag, anti-badword.
- Anti-spam with temporary mute, warnings, final warning, and automatic removal.
- Warning controls: `.warn`, `.warnings`, `.unwarn <jumlah>`.
- Social media downloader: TikTok, Instagram, Facebook, X/Twitter, YouTube, Pinterest, Threads, Reddit, SoundCloud, Douyin, Bilibili, and more.
- Universal media commands: `.univmp3 <link>` and `.univmp4 <link>`.
- Local MP4-to-MP3 conversion through FFmpeg: `.mp4to3` or `.mp4tomp3`.
- `.mp4to3` supports a URL, a video captioned with command, or a reply to a video.
- Sticker, image, text effect, utility, AI, and game commands.

## Requirements

- Node.js `>=18`
- npm
- FFmpeg with `libmp3lame` encoder for MP4-to-MP3 conversion
- A WhatsApp account for pairing

Verify FFmpeg:

```bash
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | grep libmp3lame
```

## Installation

```bash
git clone https://github.com/fadhlanel/arcanis-bot.git
cd arcanis-bot
npm install
```

Copy environment template if needed:

```bash
cp .env.example .env
```

Set required environment values in `.env`. Never commit `.env`, `session/`, or WhatsApp credentials.

Start bot:

```bash
npm start
```

Other scripts:

```bash
npm run start:optimized
npm run cleanup
npm run reset-session
```

Pair WhatsApp from terminal using QR or pairing flow provided by bot startup.

## Main Commands

| Command | Description |
|---|---|
| `.help` / `.menu` | Show command menu |
| `.ping` / `.alive` | Check bot status |
| `.tagall <pesan>` | Tag all group members |
| `.warn @user` | Add warning to user |
| `.warnings @user` | Check user warnings |
| `.unwarn 2 @user` | Remove two warnings |
| `.antilink on/off` | Toggle link moderation |
| `.antibadword on/off` | Toggle badword moderation |
| `.univmp3 <link>` | Download direct audio, or convert video to MP3 |
| `.univmp4 <link>` | Download video from supported platform |
| `.mp4to3 <link>` | Download and convert video URL to MP3 |
| `.mp4to3` | Reply to video or send video with this caption to convert |
| `.play <judul>` / `.song <judul>` | Search and download song |
| `.video <judul>` | Search and download video |
| `.sticker` / `.s` | Create sticker from replied media |
| `.brat <teks> gerak` | Create animated Brat sticker |
| `.ai <pertanyaan>` | Ask AI |

Use `.help` for complete command list.

## MP4 to MP3

FFmpeg runs locally. Media is stored temporarily in `temp/`, converted, sent back, then cleaned up.

```text
Reply video: .mp4to3
Video caption: .mp4to3
URL: .mp4to3 https://example.com/video.mp4
```

For social URLs, use `.univmp3 <link>`. Bot tries direct audio first. If no audio exists, bot downloads video and converts it to MP3 with FFmpeg.

## Project Structure

```text
commands/       Command handlers
lib/            Shared helpers, media, scraper, FFmpeg utilities
scrapr-main/    Local @coflyn/scrapr package
data/           Runtime moderation/configuration data
session/        WhatsApp session data; do not commit
temp/           Temporary media files; do not commit
```

## Security Notes

- Keep `.env` and `session/` private.
- Do not publish WhatsApp credentials, API keys, phone numbers, or runtime session files.
- Do not use bot for spam, bulk messaging, harassment, or illegal activity.
- Apply upload size limits and keep FFmpeg installed only from trusted sources.
- WhatsApp may restrict or ban accounts for automation. Use at your own risk.

## Legal

ARCANIS BOT is an independent project. It is not affiliated with, endorsed by, or sponsored by WhatsApp or Meta.

Use this project only in compliance with local law, WhatsApp terms, and third-party platform terms.

## Credits

- [Baileys](https://github.com/WhiskeySockets/Baileys)
- [`@coflyn/scrapr`](https://github.com/coflyn/scrapr)
- Open-source libraries listed in `package.json`

## License

MIT. Preserve license notices from included dependencies and source material.
