const TelegramBot = require('node-telegram-bot-api');

/**
 * Telegram Class
 *
 * @class telegram
 */
class telegram {
    /**
     * Creates an instance of telegram.
     * @param {Object} core
     * @memberof telegram
     */
    constructor(core) {
        this.core = core;
        core.urlParser.registerURLHandler('^tg://', this.getFile.bind(this));
        core.urlParser.registerMetadataProvider('^tg://', this.getMetadata.bind(this));

        // Create bot
        this.bot = new TelegramBot(core.config.telegram.token, {polling: true});

        // Handle command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, (msg) => {
            // TODO
        });

        // Audio
        this.bot.on('audio', async (msg) => {
            const sender = (msg.from.username) ? msg.from.username : msg.from.id;
            const file = 'tg://' + msg.audio.file_id;
            if (msg.audio.title) {
                try {
                    await core.addSound(sender, file, {title: msg.audio.title});
                } catch (e) {
                    this.bot.sendMessage(msg.chat.id, '添加歌曲出錯：' + e.message, {
                        reply_to_message_id: msg.message_id
                    });
                }
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
                    // If not origin sender
                    if (title.from.id !== msg.from.id) return;

                    if (title.text) {
                        try {
                            await core.addSound(sender, file, {title: title.text});
                        } catch (e) {
                            this.bot.sendMessage(msg.chat.id, '添加歌曲出錯：' + e.message, {
                                reply_to_message_id: msg.message_id
                            });
                        }
                    } else {
                        this.bot.sendMessage(msg.chat.id, '這看起來不像是標題', {reply_to_message_id: title.message_id});
                    }

                    this.bot.removeReplyListener(needTitle.message_id);
                });
            }
        });
    }

    async getFile(fileId) {
        fileId = fileId.replace('tg://', '');
        return this.bot.getFileLink(fileId);
    }

    async getMetadata(fileId) {
        return this.core.urlParser.getMetadata(await this.getFile(fileId));
    }
}

module.exports = telegram;
