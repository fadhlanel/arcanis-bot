const messages = {
    botAdmin: 'Bot must be admin to use this command',
    groupAdmin: 'Only group admins can use this command',
    ownerOnly: 'Owner or sudo only',
    groupOnly: 'This command only works in groups',
    failed: action => `${action} failed. Try again`,
    usage: command => `Usage: ${command}`,
    aiTooLong: (max, actual) => `Query too long. Max ${max} characters, yours ${actual} characters`,
    aiUsage: 'Usage: .gpt or .gemini <question>',
    aiResponse: answer => `AI Response\n\n${answer}`,
    spamWarning: (level, duration) => `Spam warning #${level}\n\n@user muted for ${duration}. Messages will be ignored during mute`,
    kickedSpam: '@user kicked for spam after 3 warnings'
};

module.exports = messages;
