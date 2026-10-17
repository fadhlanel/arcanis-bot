const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'threads', aliases: ['thread'], platform: 'threads', domain: /threads\.(net|com)/i, label: 'Threads' });
