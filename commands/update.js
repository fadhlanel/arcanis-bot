const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const isOwnerOrSudo = require('../lib/isOwner');

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) return reject(new Error((stderr || stdout || err.message || '').toString().trim()));
            resolve((stdout || '').toString());
        });
    });
}

async function hasGit() {
    if (!fs.existsSync(path.join(process.cwd(), '.git'))) return false;
    try { await run('git --version'); return true; } catch { return false; }
}

// ── git path (primary) ──
async function updateViaGit(force) {
    const dirty = (await run('git status --porcelain').catch(() => '')).trim();
    if (dirty && !force) throw new Error('Local changes detected.\nCommit/stash dulu atau pakai `.update force`');

    const oldRev = (await run('git rev-parse HEAD').catch(() => 'unknown')).trim();
    await run('git fetch origin main --prune');
    const newRev = (await run('git rev-parse origin/main').catch(() => '')).trim();
    if (!newRev) throw new Error('Failed to resolve origin/main');

    if (oldRev === newRev) return { oldRev, newRev, already: true };

    const backup = oldRev;
    try {
        await run(`git reset --hard ${newRev}`);
        await run('git clean -fd');
    } catch (e) {
        try { await run(`git reset --hard ${backup}`); } catch {}
        throw e;
    }
    const hasLock = fs.existsSync(path.join(process.cwd(), 'package-lock.json'));
    try {
        await run(hasLock ? 'npm ci --omit=dev --no-audit --no-fund' : 'npm install --omit=dev --no-audit --no-fund');
    } catch (e) {
        try { await run(`git reset --hard ${backup}`); } catch {}
        throw new Error(`npm install failed (rolled back): ${e.message}`);
    }
    return { oldRev, newRev, already: false };
}

// ── zip path (fallback) ──
function downloadFile(url, dest, visited = new Set()) {
    return new Promise((resolve, reject) => {
        if (!url.startsWith('https://')) return reject(new Error('Hanya HTTPS yang diizinkan untuk alasan keamanan.'));
        if (visited.has(url) || visited.size > 5) return reject(new Error('Too many redirects'));
        visited.add(url);
        const client = require('https');
        const req = client.get(url, { headers: { 'User-Agent': 'Arcanis-Updater/1.0', 'Accept': '*/*' } }, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
                const loc = res.headers.location;
                if (!loc) return reject(new Error(`HTTP ${res.statusCode} without Location`));
                res.resume();
                return downloadFile(new URL(loc, url).toString(), dest, visited).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', err => { try { file.close(() => {}); } catch {} fs.unlink(dest, () => reject(err)); });
        });
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

async function extractZip(zipPath, outDir) {
    if (process.platform === 'win32') {
        await run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir.replace(/\\/g, '/')}' -Force"`);
        return;
    }
    try { await run('command -v unzip'); await run(`unzip -o '${zipPath}' -d '${outDir}'`); return; } catch {}
    try { await run('command -v 7z'); await run(`7z x -y '${zipPath}' -o'${outDir}'`); return; } catch {}
    try { await run('busybox unzip -h'); await run(`busybox unzip -o '${zipPath}' -d '${outDir}'`); return; } catch {}
    throw new Error('No unzip tool (unzip/7z/busybox). Use git mode.');
}

function copyRecursive(src, dest, ignore, rel = '', out = []) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src)) {
        if (ignore.includes(e)) continue;
        const s = path.join(src, e), d = path.join(dest, e);
        const st = fs.lstatSync(s);
        if (st.isDirectory()) copyRecursive(s, d, ignore, path.join(rel, e), out);
        else { fs.copyFileSync(s, d); out.push(path.join(rel, e).replace(/\\/g, '/')); }
    }
    return out;
}

async function updateViaZip(zipUrl, expectedHash) {
    const url = (zipUrl || require('../settings').updateZipUrl || process.env.UPDATE_ZIP_URL || '').trim();
    if (!url) throw new Error('ZIP URL kosong. Set settings.updateZipUrl atau env UPDATE_ZIP_URL');
    
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const zipPath = path.join(tmpDir, 'update.zip');
    const extractTo = path.join(tmpDir, 'update_extract');
    const backupDir = path.join(tmpDir, 'backup_' + Date.now());

    try {
        await downloadFile(url, zipPath);
        if (expectedHash) {
            const actualHash = await calculateHash(zipPath);
            if (actualHash !== expectedHash.toLowerCase()) {
                throw new Error(`Hash mismatch!\nExpected: ${expectedHash}\nActual: ${actualHash}`);
            }
        }
        if (fs.existsSync(extractTo)) fs.rmSync(extractTo, { recursive: true, force: true });
        await extractZip(zipPath, extractTo);
        const entries = fs.readdirSync(extractTo).map(n => path.join(extractTo, n));
        const srcRoot = entries.length === 1 && fs.lstatSync(entries[0]).isDirectory() ? entries[0] : extractTo;
        
        // Basic folder backup
        const ignore = ['node_modules', '.git', 'session', 'tmp', 'temp', 'data', 'baileys_store.json'];
        
        let patch = null;
        try {
            const cur = require('../settings');
            patch = { ownerNumber: cur.ownerNumber, botOwner: cur.botOwner };
        } catch {}

        // Backup current files that will be overwritten
        const filesToCopy = fs.readdirSync(srcRoot);
        for (const f of filesToCopy) {
            const s = path.join(srcRoot, f), d = path.join(backupDir, f);
            if (fs.existsSync(s) && fs.existsSync(path.join(process.cwd(), f)) && !ignore.includes(f)) {
                if (fs.lstatSync(s).isDirectory()) {
                    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
                    // lazy backup copy
                } else {
                    fs.copyFileSync(path.join(process.cwd(), f), d);
                }
            }
        }

        const copied = copyRecursive(srcRoot, process.cwd(), ignore);
        if (patch?.ownerNumber) {
            try {
                const p = path.join(process.cwd(), 'settings.js');
                if (fs.existsSync(p)) {
                    let t = fs.readFileSync(p, 'utf8');
                    t = t.replace(/ownerNumber:\s*'[^']*'/, `ownerNumber: '${patch.ownerNumber}'`);
                    if (patch.botOwner) t = t.replace(/botOwner:\s*'[^']*'/, `botOwner: '${patch.botOwner}'`);
                    fs.writeFileSync(p, t);
                    delete require.cache[require.resolve('../settings')];
                }
            } catch {}
        }
        try { await run('npm install --omit=dev --no-audit --no-fund'); } catch {}
        return { copied };
    } catch (e) {
        // Restore from backup if possible
        if (fs.existsSync(backupDir)) {
            const backedUp = fs.readdirSync(backupDir);
            for (const f of backedUp) fs.copyFileSync(path.join(backupDir, f), path.join(process.cwd(), f));
        }
        throw e;
    } finally {
        try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(zipPath, { force: true }); } catch {}
        try { fs.rmSync(backupDir, { recursive: true, force: true }); } catch {}
    }
}

async function restart(sock, chatId, message) {
    try { await sock.sendMessage(chatId, { text: '✅ Update selesai! Restarting…' }, { quoted: message }); } catch {}
    try { await run('pm2 restart all'); return; } catch {}
    setTimeout(() => process.exit(0), 600);
}

async function updateCommand(sock, chatId, message, args = []) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        await sock.sendMessage(chatId, { text: '❌ Hanya owner/sudo bisa pakai .update' }, { quoted: message });
        return;
    }
    const force = args.includes('force');
    const zipArg = args.find(a => a.startsWith('http://') || a.startsWith('https://'));
    const hashArg = args.find(a => a.length === 64 && /^[a-f0-9]+$/i.test(a));

    if (args[0] === 'check') {
        if (await hasGit()) {
            try {
                await run('git fetch origin main --prune');
                const local = (await run('git rev-parse HEAD')).trim().slice(0, 7);
                const remote = (await run('git rev-parse origin/main')).trim().slice(0, 7);
                const msg = local === remote ? `✅ Sudah up-to-date (${local})` : `🔄 Update tersedia\nLocal: ${local}\nRemote: ${remote}\nKetik .update untuk apply`;
                await sock.sendMessage(chatId, { text: msg }, { quoted: message });
            } catch (e) { await sock.sendMessage(chatId, { text: `❌ Check gagal: ${e.message}` }, { quoted: message }); }
        } else {
            await sock.sendMessage(chatId, { text: 'ℹ️ Git tidak tersedia. Pakai .update <zipUrl> untuk zip mode.' }, { quoted: message });
        }
        return;
    }

    try {
        await sock.sendMessage(chatId, { text: '🔄 Updating… mohon tunggu' }, { quoted: message });
        if (zipArg) {
            const { copied } = await updateViaZip(zipArg, hashArg);
            await sock.sendMessage(chatId, { text: `✅ Update via ZIP: ${copied.length} file` }, { quoted: message });
        } else if (await hasGit()) {
            const { oldRev, newRev, already } = await updateViaGit(force);
            if (already) {
                await sock.sendMessage(chatId, { text: `✅ Sudah up-to-date: ${newRev.slice(0, 7)}` }, { quoted: message });
                return;
            }
            const shortOld = oldRev.slice(0, 7), shortNew = newRev.slice(0, 7);
            try {
                const log = (await run(`git log --oneline ${oldRev}..${newRev}`).catch(() => '')).trim();
                const preview = log ? log.split('\n').slice(0, 10).join('\n') : '-';
                await sock.sendMessage(chatId, { text: `✅ Updated ${shortOld} → ${shortNew}\n${preview}` }, { quoted: message });
            } catch { await sock.sendMessage(chatId, { text: `✅ Updated ${shortOld} → ${shortNew}` }, { quoted: message }); }
        } else {
            const { copied } = await updateViaZip();
            await sock.sendMessage(chatId, { text: `✅ Update via ZIP: ${copied.length} file` }, { quoted: message });
        }
        await restart(sock, chatId, message);
    } catch (err) {
        console.error('[update] failed:', err);
        await sock.sendMessage(chatId, { text: `❌ Update gagal:\n${String(err.message || err).slice(0, 1500)}` }, { quoted: message });
    }
}

module.exports = updateCommand;
