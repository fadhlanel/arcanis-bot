const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'bilibili', platform: 'bilibili', domain: /bilibili\.com/i, label: 'Bilibili' });
