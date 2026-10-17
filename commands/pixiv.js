const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'pixiv', platform: 'pixiv', domain: /pixiv\.net/i, label: 'Pixiv' });
