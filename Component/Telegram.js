const TelegramBot = require('node-telegram-bot-api');

/**
 * Telegram Class
 *
 * @class telegram
 */
class telegram {
    /**
     * Creates an instance of telegram.
     *
     * @param {Object} core
     * @memberof telegram
     */
    constructor(core) {
        this.core = core;

        // Create bot
        this.bot = new TelegramBot(core.config.telegram.token, {polling: true});

        // Register URLParser
        core.urlParser.registerURLHandler('^tg://', this.getFile.bind(this));
        core.urlParser.registerMetadataProvider('^tg://', this.getMetadata.bind(this));

        // Register listener
        this.bot.getMe().then((me) => {
            this.username = me.username;
            this._listener();
        });
    }

    async _listener() {
        // Handle command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, (msg, match) => {
            // TODO
        });

        // Audio
        this.bot.on('audio', this._processAudio.bind(this));

        // File
        this.bot.on('document', this._processFile.bind(this));

        // Link
        this.bot.on('text', (msg) => {
            if (msg.entities) {
                for (const entity of msg.entities) {
                    if (entity.type === 'url') {
                        this._processLink(msg, msg.text.substr(entity.offset, entity.length));
                    }

                    if (entity.type === 'text_link') {
                        this._processLink(msg, entity.url);
                    }
                }
            }
        });
    }

    async _processAudio(msg) {
        const sender = (msg.from.username) ? msg.from.username : msg.from.id;
        const file = 'tg://' + msg.audio.file_id;

        if (msg.audio.title) {
            try {
                await this.core.addSound(sender, file, {
                    title: msg.audio.title,
                    artist: msg.audio.performer,
                    duration: msg.audio.duration
                });
            } catch (e) {
                this._sendError(msg, '添加歌曲錯誤：' + e.message);
            }
        } else {
            this.core.addSound(sender, file, {
                title: await this._retrySendNeedTitle(msg),
                artist: msg.audio.performer,
                duration: msg.audio.duration
            });
        }
    }

    async _processFile(msg, metadata = {}) {
        const sender = (msg.from.username) ? msg.from.username : msg.from.id;
        const file = 'tg://' + msg.document.file_id;

        try {
            await this.core.addSound(sender, file, metadata);
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this._retrySendNeedTitle(msg);
                this._processFile(msg, file, {title: title});
            } else {
                this._sendError(msg, '檔案處理失敗：'+ e.message);
            }
        }
    }

    async _processLink(msg, link, metadata = []) {
        const sender = (msg.from.username) ? msg.from.username : msg.from.id;

        try {
            await this.core.addSound(sender, link, metadata);
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this._retrySendNeedTitle(msg);
                this._processLink(msg, link, {title: title});
            } else {
                this._sendError(msg, '連結處理失敗：'+ e.message);
            }
        }
    }

    async _sendError(msg, errorMessage) {
        return this.bot.sendMessage(msg.chat.id, errorMessage, {
            reply_to_message_id: msg.message_id
        });
    }

    /**
     * Retry version {@link telegram#_sendNeedTitle}
     *
     * @param {Object} msg
     * @param {number} [time=5]
     * @return {Promise<String>}
     * @memberof telegram
     */
    async _retrySendNeedTitle(msg, time = 5) {
        for (let i = 1; i <= time; i++) {
            try {
                return await this._sendNeedTitle(msg);
            } catch (e) {
                // Send error if try 5 time
                if (i === time) this._sendError(msg, '設定標題錯誤：' + e.message);
                throw e;
            }
        }
    }

    /**
     * Send need title message
     *
     * @param {Object} msg
     * @return {Promise<String>}
     * @memberof telegram
     */
    async _sendNeedTitle(msg) {
        const needTitle = await this.bot.sendMessage(msg.chat.id, '這個音樂沒有標題\n請幫它添加一個！', {
            reply_to_message_id: msg.message_id,
            reply_markup: {
                force_reply: true,
                selective: true
            }
        });

        return new Promise((resolve, reject) => {
            this.bot.onReplyToMessage(msg.chat.id, needTitle.message_id, (title) => {
                // If not origin sender
                if (title.from.id !== msg.from.id) return;

                if (title.text) {
                    resolve(title.text);
                } else {
                    this.bot.sendMessage(msg.chat.id, '這看起來不像是標題', {reply_to_message_id: title.message_id}).then(() => {
                        reject(new Error('Wrong title'));
                    });
                }

                this.bot.removeReplyListener(needTitle.message_id);
            });
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
