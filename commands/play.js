const songCommand = require('./song');

async function playCommand(sock, chatId, message) {
    return songCommand(sock, chatId, message);
}

module.exports = playCommand;