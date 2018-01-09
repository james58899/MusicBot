const TelegramBot = require('node-telegram-bot-api');

class telegram {
    constructor(config) {
        this.bot = new TelegramBot(config.discord.token, {polling: true});
    }
}

module.exports = telegram