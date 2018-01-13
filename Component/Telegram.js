const TelegramBot = require('node-telegram-bot-api');

class telegram {
    /**
     * Creates an instance of telegram.
     * @param {any} config
     * @param {any} core
     * @memberof telegram
     */
    constructor(config, core) {
        this.bot = new TelegramBot(config.telegram.token, {polling: true});

        // Command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, (msg) => {
            // TODO
        });

        // Audio
        this.bot.on('audio', async (msg) => {
            if (msg.audio.title) {
                const link = await this.bot.getFileLink(msg.audio.file_id);
                await core.add(link, msg.audio.duration, msg.audio.title, msg.audio.performer);
            } else {
                // send title request message
                const needTitle = await this.bot.sendMessage(msg.chat.id, '這個音樂沒有標題\n請幫它添加一個！', {
                    reply_to_message_id: msg.message_id,
                    reply_markup: {
                        force_reply: true,
                        selective: true
                    }
                });

                // wait reply
                this.bot.onReplyToMessage(msg.chat.id, needTitle.message_id, async (title) => {
                    if (title.text) {
                        const link = await this.bot.getFileLink(msg.audio.file_id);
                        core.add(link, msg.audio.duration, title.text, msg.audio.performer);
                    } else {
                        this.bot.sendMessage(msg.chat.id, '這看起來不像是標題', {reply_to_message_id: title.message_id});
                    }
                });
            }
        });
    }
}

module.exports = telegram;
