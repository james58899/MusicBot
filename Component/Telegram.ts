import TelegramBot, { Message, User } from "node-telegram-bot-api";
import { Core } from "..";
import { AudioManager, IAudioData } from "../Core/AudioManager";
import { ERR_BIND_TOKEN_NOT_FOUND, ERR_USER_EXIST, IBindData, UserManager } from "../Core/UserManager";

const BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_NOT_REGISTER = "Please register or bind account!";

export class Telegram {
    private audio: AudioManager;
    private user: UserManager;
    private bot: TelegramBot;
    private me!: User;

    constructor(core: Core) {
        if (!core.config.telegram.token) throw ERR_MISSING_TOKEN;

        this.user = core.userManager;
        this.audio = core.audioManager;

        // Create bot
        this.bot = new TelegramBot(core.config.telegram.token, {
            polling: true,
        });

        // Register URLParser
        this.audio.urlParser.registerURLHandler("^tg://", this.getFile.bind(this));
        this.audio.urlParser.registerMetadataProvider("^tg://", this.getMetadata.bind(this));

        // Register listener
        this.bot.getMe().then(me => {
            this.me = me as User;
            this.listener();
        });
    }

    private async listener() {
        // Handle command
        this.bot.onText(/^\/(\w+)@?(\w*)/i, async (msg, match) => {
            if (!match || msg.chat.type !== "private" && match[2] !== this.me.username) return;
            switch (match[1]) {
                case "register":
                    this.createUser(msg);
                    break;
                case "bind":
                    this.bind(msg);
                    break;
                case "info":
                    this.getUserInfo(msg);
                    break;
            }
        });

        // Audio
        this.bot.on("audio", this.processAudio.bind(this));

        // File
        this.bot.on("document", this.processFile.bind(this));

        // Link
        this.bot.on("text", async (msg: Message) => {
            if (msg.entities && msg.entities.some(entity => entity.type.match(/url|text_link/ig) != null)) {
                this.sendProcessing(msg);
                for (const entity of msg.entities) {
                    if (entity.type === "url" && msg.text) {
                        this.processLink(msg, msg.text.substr(entity.offset, entity.length));
                    }

                    if (entity.type === "text_link" && entity.url) {
                        this.processLink(msg, entity.url);
                    }
                }
            }
        });
    }

    private async createUser(msg: Message) {
        if (!msg.text || !msg.from) return;

        const args = msg.text.split(" ");

        try {
            if (args.length > 1) {
                await this.user.createFromToken(args[1], { type: BIND_TYPE, id: msg.from.id });
            } else {
                await this.user.create(
                    msg.from.username || msg.from.id.toString(),
                    { type: BIND_TYPE, id: msg.from.id }
                );
            }
        } catch (error) {
            this.sendError(msg, error.message);
            return;
        }

        this.getUserInfo(msg);
    }

    private async bind(msg: Message) {
        if (!msg.from) return;

        const user = await this.getUser(msg.from.id);

        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        this.bot.sendMessage(
            msg.chat.id,
            `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`
        );
    }

    private async getUserInfo(msg: Message) {
        if (!msg.from) return;

        const user = await this.user.get(BIND_TYPE, msg.from.id);
        if (!user) {
            this.bot.sendMessage(msg.chat.id, "User not found");
        } else {
            this.bot.sendMessage(
                msg.chat.id,
                `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`
            );
        }
    }

    private async processAudio(msg: Message) {
        if (!msg.from || !msg.audio) return;

        const sender = await this.getUser(msg.from.id);
        if (!sender) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        const file = "tg://" + msg.audio.file_id;
        const replyMessage = await this.sendProcessing(msg);

        if (replyMessage instanceof Error) { throw replyMessage; }

        if (msg.audio && msg.audio.title) {
            try {
                const sound = await this.audio.add(sender._id, file, {
                    artist: msg.audio.performer,
                    duration: msg.audio.duration,
                    title: msg.audio.title
                });

                if (sound) { this.sendDone(replyMessage, sound); }
            } catch (e) {
                this.sendError(replyMessage, "添加歌曲錯誤：" + e.message);
            }
        } else {
            const title = await this.retrySendNeedTitle(msg);
            if (!title) return;

            const sound = await this.audio.add(sender._id, file, {
                artist: msg.audio.performer,
                duration: msg.audio.duration,
                title
            });

            if (sound) this.sendDone(replyMessage, sound);
        }
    }

    private async processFile(msg: Message, title: string) {
        if (msg.from == null || !msg.document) return;

        const sender = await this.getUser(msg.from.id);

        if (!sender) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        const source = "tg://" + msg.document.file_id;

        const replyMessage = await this.sendProcessing(msg);

        if (replyMessage instanceof Error) { throw replyMessage; }

        try {
            const sound = await this.audio.add(sender._id, source);

            if (sound) this.sendDone(replyMessage, sound); else this.sendError(replyMessage, "failed");
        } catch (e) {
            if (e.message === "Missing title") {
                const title = await this.retrySendNeedTitle(msg);
                if (!title) return;

                this.processFile(msg, title);
            } else {
                this.sendError(replyMessage, "檔案處理失敗：" + e.message);
            }
        }
    }

    private async processLink(msg: Message, link: string, title?: string) {
        if (msg.from == null) return;

        const sender = await this.getUser(msg.from.id);

        if (!sender) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        try {
            const sound = await this.audio.add(sender._id, link);
            if (sound) this.sendDone(msg, sound);
        } catch (e) {
            if (e.message === "Missing title") {
                const title = await this.retrySendNeedTitle(msg);
                this.processLink(msg, link, title);
            } else {
                this.sendError(msg, `連結 ${link} 處理失敗：${e.message}`);
            }
        }
    }

    private async sendProcessing(msg: Message) {
        return this.bot.sendMessage(msg.chat.id, "處理中...", {
            reply_to_message_id: msg.message_id
        });
    }

    private async sendDone(msg: Message, sound: IAudioData) {
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
        if (!msg.from) return;

        if (msg.from.id === this.me.id) {
            return this.bot.editMessageText(errorMessage, {
                chat_id: msg.chat.id,
                disable_web_page_preview: true,
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
                    this.sendError(msg, "設定標題錯誤：" + e.message);
                    throw e;
                }
            }
        }

        return undefined;
    }

    private async sendNeedTitle(msg: Message): Promise<string> {
        const needTitle = await this.bot.sendMessage(msg.chat.id, "這個音樂沒有標題\n請幫它添加一個！", {
            reply_markup: {
                force_reply: true,
                selective: true,
            },
            reply_to_message_id: msg.message_id
        }) as Message;

        return new Promise<string>((resolve, reject) => {
            this.bot.onReplyToMessage(msg.chat.id, needTitle.message_id, title => {
                // If not origin sender
                if (!title.from || !msg.from || title.from.id !== msg.from.id) return;

                if (title.text) {
                    resolve(title.text);
                } else {
                    this.bot.sendMessage(msg.chat.id, "這看起來不像是標題", {
                        reply_to_message_id: title.message_id,
                    }).then(() => {
                        reject(new Error("Wrong title"));
                    });
                }

                this.bot.removeReplyListener(needTitle.message_id);
            });
        });
    }

    private getUser(id: number) {
        return this.user.get(BIND_TYPE, id);
    }

    private getFile(fileId: string) {
        fileId = fileId.replace("tg://", "");
        return this.bot.getFileLink(fileId);
    }

    private async getMetadata(fileId: string) {
        const file = await this.getFile(fileId);
        if (file instanceof Error) throw file;

        return this.audio.urlParser.getMetadata(file);
    }
}
