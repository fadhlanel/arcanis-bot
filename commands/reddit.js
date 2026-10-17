const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'reddit', platform: 'reddit', domain: /reddit\.com/i, label: 'Reddit' });
