const fs = require('fs');
const path = require('path');

// Package CJS: cukup require.resolve.
const CJS_MODULES = ['dotenv', '@whiskeysockets/baileys'];
// ESM-only: exports tanpa kondisi "require", jadi require.resolve() gagal
// (ERR_PACKAGE_PATH_NOT_EXPORTED) walaupun package terpasang normal.
const ESM_MODULES = ['@xbibzlibrary/whatsbibz'];

const ROOT_DIR = path.resolve(__dirname, '..');

function isInstalled(name) {
    try {
        require.resolve(name);
        return true;
    } catch {}
    return fs.existsSync(path.join(ROOT_DIR, 'node_modules', name, 'package.json'));
}

async function findMissingModules() {
    const missing = [];

    for (const name of CJS_MODULES) {
        if (!isInstalled(name)) missing.push(name);
    }

    for (const name of ESM_MODULES) {
        if (!isInstalled(name)) {
            missing.push(name);
            continue;
        }
        // Uji import sungguhan: menangkap dependency internal yang hilang
        // tanpa memblokir startup bot inti karena fitur opsional.
        try {
            await import(name);
        } catch (err) {
            console.warn(`[Supervisor] Peringatan: ${name} terpasang tetapi gagal diimpor (${err.code || err.message}). Fitur terkait tidak akan berjalan.`);
        }
    }

    return missing;
}

module.exports = { findMissingModules, isInstalled, CJS_MODULES, ESM_MODULES };
