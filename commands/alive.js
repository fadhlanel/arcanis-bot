const settings = require("../settings");
async function aliveCommand(sock, chatId, message) {
    try {
        const message1 = `${settings.botName || 'BotGajeJir'} v${settings.version}
Status: Online

Features:
• Group Management
• Moderation Tools
• AI Assistant
• Media Download
• Fun Commands

Type .menu for command list`;

        await sock.sendMessage(chatId, {
            text: message1
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Bot is alive and running' }, { quoted: message });
    }
}

module.exports = aliveCommand;