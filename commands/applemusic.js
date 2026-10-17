const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'applemusic', aliases: ['am'], platform: 'applemusic', domain: /music\.apple\.com/i, label: 'Apple Music' });
