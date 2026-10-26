// Supervisor ARCANIS BOT — menjaga worker bot (bot.js) tetap hidup.
// Bot dijalankan sebagai child process agar proses bisa di-update dengan aman:
// `.update` meminta restart lewat exit code 42, supervisor lalu fork ulang bot.

const { fork } = require('child_process');
const path = require('path');

const WORKER_FILE = path.join(__dirname, 'bot.js');
const RESTART_EXIT_CODE = 42;

let worker = null;
let shuttingDown = false;
let restartCount = 0;

function launchWorker() {
    worker = fork(WORKER_FILE, process.argv.slice(2), {
        cwd: __dirname,
        env: process.env,
        stdio: 'inherit',
        execArgv: process.execArgv
    });

    worker.on('exit', (code, signal) => {
        worker = null;
        if (shuttingDown) return;

        // Dihentikan manual (Ctrl+C / kill) → jangan dihidupkan ulang
        if (signal) {
            console.log(`[Supervisor] Worker dihentikan (${signal}).`);
            process.exit(1);
        }

        if (code === RESTART_EXIT_CODE) {
            restartCount++;
            console.log(`[Supervisor] Restart #${restartCount} diminta worker, menjalankan ulang bot…`);
            setTimeout(launchWorker, 1000);
            return;
        }

        process.exit(typeof code === 'number' ? code : 1);
    });
}

function forwardSignal(signal) {
    shuttingDown = true;
    if (worker) {
        try { worker.kill(signal); } catch {}
    }
    // beri waktu worker berhenti lebih dulu, lalu supervisor ikut keluar
    setTimeout(() => process.exit(0), 2500).unref();
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

console.log('[Supervisor] Meluncurkan worker bot.js…');
launchWorker();
