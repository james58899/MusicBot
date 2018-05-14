import TelegramBot, { Message, User } from "node-telegram-bot-api";
import Queue from "promise-queue";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, IAudioData } from "../Core/AudioManager";
import { ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry, sleep } from "../Core/Utils/PromiseUtils";

export const BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_NOT_REGISTER = "Please use /register to register or bind account!";

export class Telegram {
    private audio: AudioManager;
    private user: UserManager;
    private list: ListManager;
    private bot: TelegramBot;
    private me!: User;
    private messageQueue = new Queue(1);

    constructor(core: Core) {
        if (!core.config.telegram.token) throw ERR_MISSING_TOKEN;

        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;

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
                    this.commandRegister(msg);
                    break;
                case "bind":
                    this.commandBind(msg);
                    break;
                case "info":
                    this.commandInfo(msg);
                    break;
            }
        });

        // Audio
        this.bot.on("audio", msg => this.processAudio(msg));

        // File
        this.bot.on("document", msg => this.processFile(msg));

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

        this.bot.on("error", err => console.error(err));
    }

    private async commandRegister(msg: Message) {
        if (!msg.from || !msg.text) return;

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

        this.commandInfo(msg);
    }

    private async commandBind(msg: Message) {
        if (!msg.from) return;

        const user = await this.getUser(msg.from.id);

        if (!user) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        this.queueSendMessage(
            msg.chat.id,
            `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`
        );
    }

    private async commandInfo(msg: Message) {
        if (!msg.from) return;

        const user = await this.user.get(BIND_TYPE, msg.from.id);
        if (!user) {
            this.queueSendMessage(msg.chat.id, ERR_NOT_REGISTER);
        } else {
            this.queueSendMessage(
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

        if (replyMessage instanceof Error) throw replyMessage;

        if (msg.audio && msg.audio.title) {
            try {
                const sound = await this.audio.add(sender._id, file, {
                    artist: msg.audio.performer,
                    duration: msg.audio.duration,
                    title: msg.audio.title
                });

                if (sound) this.sendDone(replyMessage, sound);
            } catch (e) {
                this.sendError(replyMessage, "添加歌曲錯誤：" + e.message);
            }
        } else {
            const title = await retry(() => this.sendNeedTitle(msg), 3);
            if (!title) return;

            const sound = await this.audio.add(sender._id, file, {
                artist: msg.audio.performer,
                duration: msg.audio.duration,
                title
            });

            if (sound) this.sendDone(replyMessage, sound);
        }
    }

    private async processFile(msg: Message, title?: string) {
        if (msg.from == null || !msg.document) return;

        const sender = await this.getUser(msg.from.id);

        if (!sender) {
            this.sendError(msg, ERR_NOT_REGISTER);
            return;
        }

        const source = "tg://" + msg.document.file_id;

        const replyMessage = await this.sendProcessing(msg);

        if (replyMessage instanceof Error) throw replyMessage;

        try {
            const sound = await this.audio.add(sender._id, source, { title });

            if (sound) this.sendDone(replyMessage, sound); else this.sendError(replyMessage, "failed");
        } catch (error) {
            if (error === ERR_MISSING_TITLE) {
                title = await retry(() => this.sendNeedTitle(msg), 3);
                if (!title) return;

                this.processFile(msg, title);
            } else {
                this.sendError(replyMessage, "檔案處理失敗：" + error.message);
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
                title = await retry(() => this.sendNeedTitle(msg), 3);
                this.processLink(msg, link, title);
            } else {
                this.sendError(msg, `連結 ${link} 處理失敗：${e.message}`);
            }
        }
    }

    private async sendProcessing(msg: Message) {
        return this.queueSendMessage(msg.chat.id, "處理中...", {
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
            return this.queueSendMessage(msg.chat.id, message, {
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
            return this.queueSendMessage(msg.chat.id, errorMessage, {
                disable_web_page_preview: true,
                reply_to_message_id: msg.message_id
            });
        }
    }

    private async sendNeedTitle(msg: Message): Promise<string> {
        const needTitle = await this.queueSendMessage(msg.chat.id, "這個音樂沒有標題\n請幫它添加一個！", {
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
                    this.queueSendMessage(msg.chat.id, "這看起來不像是標題", {
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

    private queueSendMessage(chatId: number | string, text: string, options?: TelegramBot.SendMessageOptions) {
        return this.messageQueue.add(async () => {
            const callback = this.bot.sendMessage(chatId, text, options);
            await sleep(1000);
            return callback;
        });
    }
}
