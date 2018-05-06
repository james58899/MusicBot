import { Core } from "..";
import TelegramBot, { User, Message } from 'node-telegram-bot-api';
import { UserManager, BindData } from "../Core/UserManager";
import { AudioData } from "../Core/AudioManager";

export class Telegram {
    core: Core
    user!: UserManager
    bot!: TelegramBot
    me!: User

    constructor(core: Core) {
        this.core = core;

        if (!core.config.telegram.token) return;

        this.user = core.database.user

        // Create bot
        this.bot = new TelegramBot(core.config.telegram.token, {
            polling: true
        });

        // Register URLParser
        core.urlParser.registerURLHandler('^tg://', this.getFile.bind(this));
        core.urlParser.registerMetadataProvider('^tg://', this.getMetadata.bind(this));

        // Register listener
        this.bot.getMe().then((me) => {
            this.me = me as User;
            this.listener();
        });
    }

    private async listener() {
        // Handle command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, match) => {
            if (!match) return;
            switch (match[1]) {
                case 'register':
                    this.createUser(msg);
                    break;
                case 'info':
                    this.getUserInfo(msg);
                    break;
            }
        });

        // Audio
        this.bot.on('audio', this.processAudio.bind(this));

        // File
        this.bot.on('document', this.processFile.bind(this));

        // Link
        this.bot.on('text', async (msg: Message) => {
            if (msg.entities && msg.entities.some((entity) => entity.type.match(/url|text_link/ig) != null)) {
                this.sendProcessing(msg);
                for (const entity of msg.entities) {
                    if (entity.type === 'url') {
                        this.processLink(msg, msg.text!!.substr(entity.offset, entity.length));
                    }

                    if (entity.type === 'text_link' && entity.url) {
                        this.processLink(msg, entity.url);
                    }
                }
            }
        });
    }

    private async createUser(msg: Message) {
        let user;
        try {
            user = await this.user.create(msg.from!!.username || msg.from!!.id.toString(), {
                type: 'telegram',
                id: msg.from!!.id
            });
        } catch (error) {
            this.bot.sendMessage(msg.chat.id, error.message);
            return;
        }

        this.bot.sendMessage(msg.chat.id, `ID: ${user._id}\nName: ${user.name}`);
    }

    private async getUserInfo(msg: Message) {
        const user = await this.user.get('telegram', msg.from!!.id);
        if (!user) {
            this.bot.sendMessage(msg.chat.id, 'User not found');
        } else {
            this.bot.sendMessage(msg.chat.id, `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map((i: BindData) => i.type).join(', ')}`);
        }
    }

    private async processAudio(msg: Message) {
        if (msg.from == null) return

        const sender = (msg.from.username) ? msg.from.username : String(msg.from.id);
        const file = 'tg://' + msg.audio!!.file_id;

        const replyMessage = await this.sendProcessing(msg);

        if (replyMessage instanceof Error) throw replyMessage

        if (msg.audio && msg.audio.title) {
            try {
                const sound = await this.core.addSound({
                    sender: sender,
                    source: file,
                    title: msg.audio.title,
                    artist: msg.audio.performer,
                    duration: msg.audio.duration
                });

                if (sound) this.sendDone(replyMessage, sound);
            } catch (e) {
                this.sendError(replyMessage, '添加歌曲錯誤：' + e.message);
            }
        } else {
            const sound = await this.core.addSound({
                sender: sender,
                source: file,
                title: await this.retrySendNeedTitle(msg),
                artist: msg.audio!!.performer,
                duration: msg.audio!!.duration
            });

            if (sound) this.sendDone(replyMessage, sound);
        }
    }

    private async processFile(msg: Message, data: AudioData = {}) {
        data.sender = msg.from!!.username || msg.from!!.id.toString();
        data.source = 'tg://' + msg.document!!.file_id;

        const replyMessage = await this.sendProcessing(msg);

        if (replyMessage instanceof Error) throw replyMessage

        try {
            const sound = await this.core.addSound(data);
            if (sound) this.sendDone(replyMessage, sound); else this.sendError(replyMessage, 'failed');
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this.retrySendNeedTitle(msg);
                this.processFile(msg, { title: title });
            } else {
                this.sendError(replyMessage, '檔案處理失敗：' + e.message);
            }
        }
    }

    private async processLink(msg: Message, link: string, data: AudioData = {}) {
        data.sender = msg.from!!.username || msg.from!!.id.toString();
        data.source = link

        try {
            const sound = await this.core.addSound(data);
            if (sound) this.sendDone(msg, sound);
        } catch (e) {
            if (e.message === 'Missing title') {
                const title = await this.retrySendNeedTitle(msg);
                this.processLink(msg, link, { title: title });
            } else {
                this.sendError(msg, `連結 ${link} 處理失敗：${e.message}`);
            }
        }
    }

    private async sendProcessing(msg: Message) {
        return this.bot.sendMessage(msg.chat.id, '處理中...', {
            reply_to_message_id: msg.message_id
        });
    }

    private async sendDone(msg: Message, sound: AudioData) {
        const message = `編號： ${sound._id}\n標題： ${sound.title}`;
        if (msg.from && msg.from.id === this.me.id) {
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

    private async sendError(msg: Message, errorMessage: string) {
        if (msg.from!!.id === this.me.id) {
            return this.bot.editMessageText(errorMessage, {
                disable_web_page_preview: true,
                chat_id: msg.chat.id,
                message_id: msg.message_id
            });
        } else {
            return this.bot.sendMessage(msg.chat.id, errorMessage, {
                disable_web_page_preview: true,
                reply_to_message_id: msg.message_id
            });
        }
    }

    private async retrySendNeedTitle(msg: Message, time: number = 5) {
        for (let i = 1; i <= time; i++) {
            try {
                return await this.sendNeedTitle(msg);
            } catch (e) {
                // Send error if try 5 time
                if (i === time) {
                    this.sendError(msg, '設定標題錯誤：' + e.message);
                    throw e;
                }
            }
        }

        return undefined
    }

    private async sendNeedTitle(msg: Message): Promise<string> {
        const needTitle = await this.bot.sendMessage(msg.chat.id, '這個音樂沒有標題\n請幫它添加一個！', {
            reply_to_message_id: msg.message_id,
            reply_markup: {
                force_reply: true,
                selective: true
            }
        }) as Message;

        return new Promise<string>((resolve, reject) => {
            this.bot.onReplyToMessage(msg.chat.id, needTitle.message_id, (title) => {
                // If not origin sender
                if (title.from!!.id !== msg.from!!.id) return;

                if (title.text) {
                    resolve(title.text);
                } else {
                    this.bot.sendMessage(msg.chat.id, '這看起來不像是標題', {
                        reply_to_message_id: title.message_id
                    }).then(() => {
                        reject(new Error('Wrong title'));
                    });
                }

                this.bot.removeReplyListener(needTitle.message_id);
            });
        });
    }

    async getFile(fileId: string) {
        fileId = fileId.replace('tg://', '');
        return this.bot.getFileLink(fileId);
    }

    async getMetadata(fileId: string) {
        const file = await this.getFile(fileId)
        if (file instanceof Error) throw file

        return this.core.urlParser.getMetadata(file);
    }
}
