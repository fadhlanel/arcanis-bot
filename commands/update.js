const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const isOwnerOrSudo = require('../lib/isOwner');

// Konfigurasi default repository GitHub bot
const GITHUB_REPO = process.env.GITHUB_REPO || 'fadhlanel/arcanis-bot';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Tentukan direktori root bot terlepas dari working directory process
function getRootDir() {
    const fromModule = path.resolve(__dirname, '..');
    if (fs.existsSync(path.join(fromModule, '.git'))) return fromModule;
    if (fs.existsSync(path.join(process.cwd(), '.git'))) return process.cwd();
    return fromModule;
}
const ROOT_DIR = getRootDir();

function run(cmd, cwd = ROOT_DIR) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString().trim()));
            resolve((stdout || '').toString());
        });
    });
}

async function hasGit() {
    if (!fs.existsSync(path.join(ROOT_DIR, '.git'))) return false;
    try {
        await run('git --version');
        return true;
    } catch {
        return false;
    }
}

async function getBranch() {
    try {
        const b = (await run('git rev-parse --abbrev-ref HEAD')).trim();
        if (b && b !== 'HEAD') return b;
    } catch {}
    return GITHUB_BRANCH;
}

// ── GitHub API helper (untuk container tanpa Git seperti Pterodactyl/OptikLink) ──
function fetchLatestCommit(repo = GITHUB_REPO, branch = GITHUB_BRANCH) {
    return new Promise((resolve, reject) => {
        const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 Arcanis-Bot-Updater',
                'Accept': 'application/vnd.github.v3+json'
            },
            timeout: 10000
        }, res => {
            if (res.statusCode !== 200) {
                return reject(new Error(`GitHub API HTTP ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({
                        sha: json.sha || '',
                        shortSha: (json.sha || '').slice(0, 7),
                        message: json.commit?.message?.split('\n')[0] || '',
                        date: json.commit?.committer?.date || json.commit?.author?.date || ''
                    });
                } catch (e) { reject(e); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('GitHub API timeout')); });
        req.on('error', reject);
    });
}

// ── git path (primary bila git tersedia) ──
async function updateViaGit(force) {
    const dirty = (await run('git status --porcelain').catch(() => '')).trim();
    if (dirty && !force) {
        throw new Error('Terdeteksi perubahan lokal yang belum di-commit.\nCommit/stash terlebih dahulu atau gunakan `.update force`');
    }

    const branch = await getBranch();
    const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run(`git fetch origin ${branch} --prune`);
    
    let newRev = (await run(`git rev-parse origin/${branch}`).catch(() => '')).trim();
    if (!newRev) {
        newRev = (await run('git rev-parse origin/main').catch(() => '')).trim() ||
                 (await run('git rev-parse origin/master').catch(() => '')).trim();
    }
    if (!newRev) throw new Error(`Gagal resolve remote commit untuk origin/${branch}`);

    if (oldRev === newRev) return { oldRev, newRev, branch, already: true, needNpm: false };

    const backup = oldRev;
    try {
        await run(`git reset --hard ${newRev}`);
    } catch (e) {
        try { await run(`git reset --hard ${backup}`); } catch {}
        throw e;
    }

    // Hanya jalankan npm install jika package.json mengalami perubahan
    let needNpm = false;
    try {
        const changedFiles = (await run(`git diff --name-only ${oldRev} ${newRev}`).catch(() => '')).trim();
        needNpm = changedFiles.split(/\r?\n/).some(f => f.trim() === 'package.json');
        if (needNpm) {
            const hasLock = fs.existsSync(path.join(ROOT_DIR, 'package-lock.json'));
            await run(hasLock ? 'npm ci --omit=dev --no-audit --no-fund' : 'npm install --omit=dev --no-audit --no-fund');
        }
    } catch (e) {
        try { await run(`git reset --hard ${backup}`); } catch {}
        throw new Error(`npm install gagal (rollback dilakukan): ${e.message}`);
    }

    try {
        fs.writeFileSync(path.join(ROOT_DIR, '.commit_version'), newRev);
    } catch {}

    return { oldRev, newRev, branch, already: false, needNpm };
}

// ── archive / zip path (fallback untuk Pterodactyl, OptikLink, atau hosting tanpa Git) ──
function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith('https://')) return reject(new Error('Hanya HTTPS yang diizinkan untuk alasan keamanan.'));
        if (visited.has(url) || visited.size > 5) return reject(new Error('Terlalu banyak redirect'));
        visited.add(url);
        
        const client = require('https');
        const req = client.get(url, { headers: { 'User-Agent': 'Arcanis-Updater/1.0', 'Accept': '*/*' }, timeout: 30000 }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                const loc = res.headers.location;
                if (!loc) return reject(new Error(`HTTP ${res.statusCode} tanpa Header Location`));
                res.resume();
                return downloadFile(new URL(loc, url).toString(), dest, visited).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP Download gagal dengan status: ${res.statusCode}`));
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', err => { try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
        });
        req.on('timeout', () => { req.destroy(); fs.unlink(dest, () => reject(new Error('Download timeout'))); });
        req.on('error', err => fs.unlink(dest, () => reject(err)));
    });
}

async function calculateHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

async function extractArchive(filePath, outDir) {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const isTar = filePath.endsWith('.tar.gz') || filePath.endsWith('.tgz');
    if (isTar) {
        try {
            await run(`tar -xzf "${filePath}" -C "${outDir}"`);
            return;
        } catch (e) {
            throw new Error(`Gagal mengekstrak tar.gz: ${e.message}`);
        }
    }

    if (process.platform === 'win32') {
        try {
            await run(`powershell -NoProfile -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`);
            return;
        } catch {}
    }

    try { await run(`tar -xf "${filePath}" -C "${outDir}"`); return; } catch {}
    try { await run(`unzip -o "${filePath}" -d "${outDir}"`); return; } catch {}
    try { await run(`7z x -y "${filePath}" -o"${outDir}"`); return; } catch {}
    try { await run(`busybox unzip -o "${filePath}" -d "${outDir}"`); return; } catch {}
    try { await run(`python3 -m zipfile -e "${filePath}" "${outDir}"`); return; } catch {}
    try { await run(`python -m zipfile -e "${filePath}" "${outDir}"`); return; } catch {}
    throw new Error('Tidak ditemukan tool ekstraksi (tar/unzip/7z/powershell).');
}

function copyRecursive(src, dest, ignore = [], rel = '', out = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) {
        if (ignore.includes(e)) continue;
        const s = path.join(src, e), d = path.join(dest, e);
        const st = fs.lstatSync(s);
        if (st.isDirectory()) {
            copyRecursive(s, d, ignore, path.join(rel, e), out);
        } else {
            fs.copyFileSync(s, d);
            out.push(path.join(rel, e).replace(/\\/g, '/'));
        }
    }
    return out;
}

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
        const s = path.join(src, item), d = path.join(dest, item);
        const st = fs.lstatSync(s);
        if (st.isDirectory()) {
            copyDirRecursive(s, d);
        } else {
            fs.copyFileSync(s, d);
        }
    }
}

async function updateViaZip(zipUrl, expectedHash) {
    let repoName = GITHUB_REPO;
    let branchName = GITHUB_BRANCH;
    try {
        const s = require('../settings');
        if (s.githubRepo) repoName = s.githubRepo;
        if (s.githubBranch) branchName = s.githubBranch;
    } catch {}

    // Default download URL otomatis ke GitHub bila tidak disediakan custom URL
    let defaultUrl = '';
    if (process.platform === 'linux') {
        defaultUrl = `https://codeload.github.com/${repoName}/tar.gz/refs/heads/${branchName}`;
    } else {
        defaultUrl = `https://github.com/${repoName}/archive/refs/heads/${branchName}.zip`;
    }

    const url = (zipUrl || defaultUrl).trim();
    if (!url) {
        throw new Error('URL unduhan update kosong.');
    }

    const tmpDir = path.join(ROOT_DIR, 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const isTar = url.includes('.tar.gz') || url.includes('/tar.gz/');
    const archivePath = path.join(tmpDir, isTar ? 'update.tar.gz' : 'update.zip');
    const extractTo = path.join(tmpDir, 'update_extract');
    const backupDir = path.join(tmpDir, 'backup_' + Date.now());

    try {
        await downloadFile(url, archivePath);
        if (expectedHash) {
            const actualHash = await calculateHash(archivePath);
            if (actualHash !== expectedHash.toLowerCase()) {
                throw new Error(`Hash mismatch!\nExpected: ${expectedHash}\nActual: ${actualHash}`);
            }
        }

        if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
        await extractArchive(archivePath, extractTo);

        const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
        const srcRoot = entries.length === 1 && fs.lstatSync(entries[0]).isDirectory() ? entries[0] : extractTo;

        const ignore = [
            'node_modules', '.git', 'session', 'auth_info', 'tmp', 'temp',
            'data', 'baileys_store.json', '.env', '.version', '.commit_version'
        ];

        // Ambil konfigurasi lokal sebelum ditimpa
        let patch = null;
        try {
            const cur = require('../settings');
            patch = {
                ownerNumber: cur.ownerNumber,
                botOwner: cur.botOwner,
                botName: cur.botName,
                packname: cur.packname
            };
        } catch {}

        // Backup file yang akan tertimpa
        fs.mkdirSync(backupDir, { recursive: true });
        const filesToCopy = fs.readdirSync(srcRoot);
        for (const f of filesToCopy) {
            const s = path.join(srcRoot, f), d = path.join(backupDir, f);
            const targetPath = path.join(ROOT_DIR, f);
            if (fs.existsSync(s) && fs.existsSync(targetPath) && !ignore.includes(f)) {
                const st = fs.lstatSync(targetPath);
                if (st.isDirectory()) {
                    copyDirRecursive(targetPath, d);
                } else {
                    fs.copyFileSync(targetPath, d);
                }
            }
        }

        // Salin file baru ke direktori bot
        const copied = copyRecursive(srcRoot, ROOT_DIR, ignore);

        // Pertahankan pengaturan owner & bot di settings.js
        if (patch?.ownerNumber) {
            try {
                const p = path.join(ROOT_DIR, 'settings.js');
                if (fs.existsSync(p)) {
                    let t = fs.readFileSync(p, 'utf8');
                    t = t.replace(/ownerNumber:\s*['"][^'"]*['"]/, `ownerNumber: '${patch.ownerNumber}'`);
                    if (patch.botOwner) t = t.replace(/botOwner:\s*['"][^'"]*['"]/, `botOwner: '${patch.botOwner}'`);
                    if (patch.botName) t = t.replace(/botName:\s*['"][^'"]*['"]/, `botName: '${patch.botName}'`);
                    if (patch.packname) t = t.replace(/packname:\s*['"][^'"]*['"]/, `packname: '${patch.packname}'`);
                    fs.writeFileSync(p, t);
                    delete require.cache[require.resolve('../settings')];
                }
            } catch {}
        }

        // Simpan commit hash terbaru ke .commit_version jika tersedia
        let newSha = '';
        try {
            const commitInfo = await fetchLatestCommit(repoName, branchName);
            newSha = commitInfo.sha;
            fs.writeFileSync(path.join(ROOT_DIR, '.commit_version'), newSha);
        } catch {}

        // Cek apakah package.json berubah dibanding backup
        try {
            const oldPkg = path.join(backupDir, 'package.json');
            const newPkg = path.join(ROOT_DIR, 'package.json');
            if (fs.existsSync(oldPkg) && fs.existsSync(newPkg)) {
                const oldContent = fs.readFileSync(oldPkg, 'utf8');
                const newContent = fs.readFileSync(newPkg, 'utf8');
                if (oldContent !== newContent) {
                    await run('npm install --omit=dev --no-audit --no-fund');
                }
            }
        } catch (npmErr) {
            console.error('[update] npm install warning:', npmErr.message);
        }

        return { copied, newSha };
    } catch (e) {
        // Rollback dari backup jika terjadi kesalahan
        if (fs.existsSync(backupDir)) {
            try {
                copyDirRecursive(backupDir, ROOT_DIR);
            } catch (restoreErr) {
                console.error('[update] Rollback error:', restoreErr);
            }
        }
        throw e;
    } finally {
        try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(archivePath, { force: true }); } catch {}
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    }
}

async function restart(sock, chatId, message) {
    try {
        await sock.sendMessage(chatId, { text: '✅ Update selesai! Me-restart bot…' }, { quoted: message });
    } catch {}
    
    setTimeout(() => {
        try {
            if (process.env.pm_id !== undefined) {
                exec(`pm2 restart ${process.env.pm_id}`);
                return;
            }
        } catch {}
        process.exit(0);
    }, 1500);
}

async function updateCommand(sock, chatId, message, args = []) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        await sock.sendMessage(chatId, { text: '❌ Hanya owner/sudo yang dapat menggunakan perintah .update' }, { quoted: message });
        return;
    }

    const subCmd = (args[0] || '').toLowerCase();
    const isCheck = ['check', 'checker', 'cek', 'status', '-c'].includes(subCmd);
    const isHelp = ['help', '-h', '--help', 'bantuan'].includes(subCmd);
    const force = args.includes('force');
    const zipArg = args.find(a => a.startsWith('https://') || a.startsWith('http://'));
    const hashArg = args.find(a => a.length === 64 && /^[a-f0-9]+$/i.test(a));

    if (isHelp) {
        const helpText = `ℹ️ *Panduan Penggunaan .update:*
- *.update check* : Cek apakah ada update baru dari repository GitHub.
- *.update* : Terapkan pembaruan otomatis (Git/GitHub archive).
- *.update force* : Terapkan pembaruan paksa meski ada perubahan lokal.
- *.update <https://...zip>* : Update manual menggunakan tautan ZIP/tar.gz eksternal.`;
        await sock.sendMessage(chatId, { text: helpText }, { quoted: message });
        return;
    }

    if (isCheck) {
        if (await hasGit()) {
            try {
                const branch = await getBranch();
                await sock.sendMessage(chatId, { text: `🔍 Memeriksa update via Git pada branch *${branch}*…` }, { quoted: message });
                await run(`git fetch origin ${branch} --prune`);
                const local = (await run('git rev-parse HEAD')).trim().slice(0, 7);
                let remote = (await run(`git rev-parse origin/${branch}`).catch(() => '')).trim();
                if (!remote) {
                    remote = (await run('git rev-parse origin/main').catch(() => '')).trim() ||
                             (await run('git rev-parse origin/master').catch(() => '')).trim();
                }
                if (!remote) throw new Error(`Tidak dapat menemukan remote branch origin/${branch}`);
                const remoteShort = remote.slice(0, 7);

                if (local === remoteShort || remote.startsWith(local)) {
                    await sock.sendMessage(chatId, { text: `✅ Bot sudah up-to-date!\nCommit: ${local} (${branch})` }, { quoted: message });
                } else {
                    const log = (await run(`git log --oneline ${local}..${remoteShort}`).catch(() => '')).trim();
                    const preview = log ? `\n\n*Perubahan terbaru:*\n${log.split('\n').slice(0, 8).join('\n')}` : '';
                    await sock.sendMessage(chatId, { 
                        text: `🔄 *Update Tersedia!*\nBranch: ${branch}\nLocal: ${local}\nRemote: ${remoteShort}${preview}\n\nKetik *.update* untuk menerapkan update.` 
                    }, { quoted: message });
                }
            } catch (e) {
                await sock.sendMessage(chatId, { text: `❌ Gagal memeriksa update Git: ${e.message}` }, { quoted: message });
            }
        } else {
            // Mode tanpa Git (misalnya di Pterodactyl/OptikLink Container)
            await sock.sendMessage(chatId, { text: `🔍 Memeriksa update dari GitHub (*${GITHUB_REPO}:${GITHUB_BRANCH}*)…` }, { quoted: message });
            try {
                const commitInfo = await fetchLatestCommit(GITHUB_REPO, GITHUB_BRANCH);
                const versionFile = path.join(ROOT_DIR, '.commit_version');
                let localSha = '';
                if (fs.existsSync(versionFile)) {
                    localSha = fs.readFileSync(versionFile, 'utf8').trim();
                }

                const isUpToDate = localSha && (localSha === commitInfo.sha || commitInfo.sha.startsWith(localSha));
                if (isUpToDate) {
                    await sock.sendMessage(chatId, { 
                        text: `✅ Bot sudah up-to-date!\nCommit: ${commitInfo.shortSha} (${commitInfo.date ? commitInfo.date.slice(0, 10) : ''})\nPesan: ${commitInfo.message}` 
                    }, { quoted: message });
                } else {
                    const currentText = localSha ? `\nLocal: ${localSha.slice(0, 7)}` : '';
                    await sock.sendMessage(chatId, { 
                        text: `🔄 *Update Tersedia di GitHub!*\nRepo: ${GITHUB_REPO} (${GITHUB_BRANCH})${currentText}\nRemote: ${commitInfo.shortSha}\nPesan: ${commitInfo.message}\nTanggal: ${commitInfo.date ? commitInfo.date.slice(0, 10) : '-'}\n\nKetik *.update* untuk menerapkan pembaruan.` 
                    }, { quoted: message });
                }
            } catch (apiErr) {
                await sock.sendMessage(chatId, { 
                    text: `❌ Gagal memeriksa update dari GitHub API:\n${apiErr.message}\n\nAnda dapat langsung menerapkan update dengan mengetik *.update*.` 
                }, { quoted: message });
            }
        }
        return;
    }

    try {
        await sock.sendMessage(chatId, { text: '🔄 Memproses update… mohon tunggu.' }, { quoted: message });
        
        if (zipArg) {
            const { copied } = await updateViaZip(zipArg, hashArg);
            await sock.sendMessage(chatId, { text: `✅ Update manual berhasil! (${copied.length} file disalin)` }, { quoted: message });
        } else if (await hasGit()) {
            const { oldRev, newRev, branch, already, needNpm } = await updateViaGit(force);
            if (already) {
                await sock.sendMessage(chatId, { text: `✅ Bot sudah up-to-date di commit ${newRev.slice(0, 7)} (${branch}).` }, { quoted: message });
                return;
            }
            const shortOld = oldRev.slice(0, 7), shortNew = newRev.slice(0, 7);
            let logMsg = '';
            try {
                const log = (await run(`git log --oneline ${oldRev}..${newRev}`).catch(() => '')).trim();
                if (log) {
                    logMsg = `\n\n*Commit Log:*\n${log.split('\n').slice(0, 8).join('\n')}`;
                }
            } catch {}
            const npmMsg = needNpm ? '\n📦 Dependency telah diperbarui.' : '';
            await sock.sendMessage(chatId, { 
                text: `✅ Berhasil update ${shortOld} → ${shortNew} (${branch})!${npmMsg}${logMsg}` 
            }, { quoted: message });
        } else {
            // Mode tanpa Git (Pterodactyl/OptikLink Container) -> otomatis unduh archive dari GitHub!
            await sock.sendMessage(chatId, { text: `📦 Mengunduh pembaruan dari GitHub (*${GITHUB_REPO}:${GITHUB_BRANCH}*)…` }, { quoted: message });
            const { copied, newSha } = await updateViaZip();
            const shaText = newSha ? ` (${newSha.slice(0, 7)})` : '';
            await sock.sendMessage(chatId, { 
                text: `✅ Berhasil memperbarui bot dari GitHub${shaText}! (${copied.length} file disalin)` 
            }, { quoted: message });
        }

        await restart(sock, chatId, message);
    } catch (err) {
        console.error('[update] failed:', err);
        await sock.sendMessage(chatId, { text: `❌ Update gagal:\n${String(err.message || err).slice(0, 1500)}` }, { quoted: message });
    }
}

module.exports = updateCommand;
