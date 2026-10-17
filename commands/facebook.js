const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'facebook', aliases: ['fb'], platform: 'facebook', domain: /facebook\.com|fb\.com/i, label: 'Facebook' });
