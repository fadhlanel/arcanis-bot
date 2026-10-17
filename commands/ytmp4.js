const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'ytmp4', aliases: ['ytvideo', 'ytv'], platform: 'youtube', domain: /youtube\.com|youtu\.be/i, label: 'YouTube' });
