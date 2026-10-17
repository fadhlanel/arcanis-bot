const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'twitter', aliases: ['x'], platform: 'twitter', domain: /twitter\.com|x\.com/i, label: 'Twitter/X' });
