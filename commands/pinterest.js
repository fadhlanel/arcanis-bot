const createCommand = require('../lib/scraprCommand');
module.exports = createCommand({ command: 'pinterest', aliases: ['pin'], platform: 'pinterest', domain: /(?:pinterest\.(?:com|co\.id)|pin\.it)/i, label: 'Pinterest' });
