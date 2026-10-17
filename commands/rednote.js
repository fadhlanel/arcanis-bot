const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'rednote', aliases: ['xiaohongshu', 'xhs'], platform: 'rednote', domain: /xiaohongshu\.com|xhslink\.com/i, label: 'RedNote' });
