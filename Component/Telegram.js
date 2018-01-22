const TelegramBot = require('node-telegram-bot-api');

/**
 * Telegram Class
 *
 * @class telegram
 */
class Telegram {
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
            this.me = me;
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
            if (msg.entities.some((entity) => entity.type.match(/url|text_link/ig))) {
                this._sendProcessing(msg);
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

        const replyMessage = this._sendProcessing(msg);

        if (msg.audio.title) {
            try {
                const sound = await this.core.addSound(sender, file, {
                    title: msg.audio.title,
                    artist: msg.audio.performer,
                    duration: msg.audio.duration
                });
                this._sendDone(await replyMessage, sound);
            } catch (e) {
                this._sendError(await replyMessage, '添加歌曲錯誤：' + e.message);
            }
        } else {
            const title = await this._retrySendNeedTitle(msg);
            const sound = this.core.addSound(sender, file, {
                title: title,
                artist: msg.audio.performer,
                duration: msg.audio.duration
            });
            this._sendDone(await replyMessage, sound);
        }
    }

    async _processFile(msg, metadata = {}) {
        const sender = (msg.from.username) ? msg.from.username : msg.from.id;
        const file = 'tg://' + msg.document.file_id;

        const replyMessage = this._sendProcessing(msg);

        try {
            const sound = await this.core.addSound(sender, file, metadata);
            this._sendDone(await replyMessage, sound);
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this._retrySendNeedTitle(msg);
                this._processFile(msg, {title: title});
            } else {
                this._sendError(replyMessage, '檔案處理失敗：' + e.message);
            }
        }
    }

    async _processLink(msg, link, metadata = {}) {
        const sender = (msg.from.username) ? msg.from.username : msg.from.id;

        try {
            const sound = await this.core.addSound(sender, link, metadata);
            this._sendDone(msg, sound);
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this._retrySendNeedTitle(msg);
                this._processLink(msg, link, {title: title});
            } else {
                this._sendError(msg, `連結 ${link} 處理失敗：${e.message}`);
            }
        }
    }

    async _sendProcessing(msg) {
        return this.bot.sendMessage(msg.chat.id, '處理中...', {
            reply_to_message_id: msg.message_id
        });
    }

    async _sendDone(msg, sound) {
        const message = `歌曲編號: ${sound.id}\n歌名： ${sound.title}`;
        if (msg.from.id === this.me.id) {
            return this.bot.editMessageText(message, {
                chat_id: msg.chat.id,
                message_id: msg.message_id
            });
        } else {
            return this.bot.sendMessage(msg.chat.id, message, {
                reply_to_message_id: msg.message_id
            });
        }
    }

    async _sendError(msg, errorMessage) {
        if (msg.from.id === this.me.id) {
            return this.bot.editMessageText(errorMessage, {
                chat_id: msg.chat.id,
                message_id: msg.message_id
            });
        } else {
            return this.bot.sendMessage(msg.chat.id, errorMessage, {
                reply_to_message_id: msg.message_id
            });
        }
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
                const title = await this._sendNeedTitle(msg);
                return title;
            } catch (e) {
                // Send error if try 5 time
                if (i === time) {
                    this._sendError(msg, '設定標題錯誤：' + e.message);
                    throw e;
                }
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

module.exports = Telegram;
