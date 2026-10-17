const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'soundcloud', aliases: ['sc'], platform: 'soundcloud', domain: /soundcloud\.com/i, label: 'SoundCloud' });
