const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'douyin', platform: 'douyin', domain: /douyin\.com/i, label: 'Douyin' });
