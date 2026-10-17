const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'bandcamp', platform: 'bandcamp', domain: /bandcamp\.com/i, label: 'Bandcamp' });
