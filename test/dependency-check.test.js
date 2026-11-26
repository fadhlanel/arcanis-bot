const test = require('node:test');
const assert = require('node:assert');
const { findMissingModules, isInstalled } = require('../lib/dependencyCheck');

test('whatsbibz ESM-only terdeteksi terpasang walau require.resolve gagal', async () => {
    assert.throws(
        () => require.resolve('@xbibzlibrary/whatsbibz'),
        { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }
    );
    assert.equal(isInstalled('@xbibzlibrary/whatsbibz'), true);
});

test('tidak ada dependency inti yang dilaporkan hilang', async () => {
    assert.deepEqual(await findMissingModules(), []);
});

test('package yang benar-benar tidak ada tetap terdeteksi hilang', () => {
    assert.equal(isInstalled('paket-tidak-ada-xyz'), false);
});

test('index.js memakai findMissingModules, bukan require.resolve langsung', () => {
    const fs = require('node:fs');
    const src = fs.readFileSync('index.js', 'utf8');
    assert.match(src, /require\('\.\/lib\/dependencyCheck'\)/);
    assert.doesNotMatch(src, /REQUIRED_MODULES/);
});
