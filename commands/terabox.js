const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'terabox', platform: 'terabox', domain: /terabox\.(com|app)/i, label: 'Terabox' });
