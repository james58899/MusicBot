"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Discord = exports.BIND_TYPE = void 0;
const mongodb_1 = require("mongodb");
const shuffle_array_1 = __importDefault(require("shuffle-array"));
const AudioManager_1 = require("../Core/AudioManager");
const PromiseUtils_1 = require("../Core/Utils/PromiseUtils");
const dysnomia_1 = require("@projectdysnomia/dysnomia");
exports.BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
const MESSAGE_VOICE_NOT_READY = "Voice connection not ready!";
const MESSAGE_NOTHING_PLAYING = "Nothing playing";
var PlayMode;
(function (PlayMode) {
    PlayMode[PlayMode["normal"] = 0] = "normal";
    PlayMode[PlayMode["random"] = 1] = "random";
})(PlayMode || (PlayMode = {}));
class Discord {
    constructor(core) {
        this.playing = new Map();
        this.config = core.config.discord;
        if (!this.config.token)
            throw ERR_MISSING_TOKEN;
        this.bot = new dysnomia_1.Client(this.config.token, {
            gateway: {
                intents: ['guilds', 'guildMessages', 'guildVoiceStates'],
            }
        });
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.user = core.userManager;
        this.bot.on("ready", () => {
            console.log("[Discord] Ready!");
            this.bot.editStatus('online', {
                name: "Self",
                type: 2
            });
        });
        this.bot.on("error", (err, id) => {
            console.error(`[Discord] Error ${id}: ${err}`);
        });
        this.registerCommand();
        void this.bot.connect();
    }
    registerCommand() {
        this.bot.on("messageCreate", msg => {
            switch (msg.content.split(" ")[1]) {
                case "hi":
                    this.commandHi(msg);
                    break;
                case "play":
                    void this.commandPlay(msg, msg.content.split(" ").slice(2));
                    break;
                case "next":
                    this.commandNext(msg);
                    break;
                case "bye":
                    this.commandBye(msg);
                    break;
                case "register":
                    void this.commandRegister(msg, msg.content.split(" ").slice(2));
                    break;
                case "bind":
                    void this.commandBind(msg);
                    break;
            }
        });
    }
    commandHi(msg) {
        if (!msg.member)
            return;
        if (msg.member.voiceState.channelID) {
            void this.bot.joinVoiceChannel(msg.member.voiceState.channelID, { opusOnly: true }).then(voice => {
                voice.on('warn', msg => console.error(`[Discord] warn: ${msg}`));
                voice.on('error', err => console.error("[Discord] error: ", err));
            });
            void this.bot.createMessage(msg.channel.id, MESSAGE_HI);
        }
        else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_HI_NOT_IN_VOICE);
        }
    }
    async commandPlay(msg, args) {
        const list = await this.list.get(new mongodb_1.ObjectId(args[0]));
        const voice = this.bot.voiceConnections.get(msg.guildID);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;
        if (!list) {
            void this.bot.createMessage(msg.channel.id, MESSAGE_LIST_NOT_FOUND);
            return;
        }
        if (!voice) {
            void this.bot.createMessage(msg.channel.id, MESSAGE_NOT_IN_VOICE);
            return;
        }
        if (!voice.ready) {
            void this.bot.createMessage(msg.channel.id, MESSAGE_VOICE_NOT_READY);
            return;
        }
        let isPlaying = false;
        if (mode === PlayMode.random)
            (0, shuffle_array_1.default)(list.audio);
        if (this.playing.has(voice.id))
            isPlaying = true;
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
        });
        if (!isPlaying) {
            const onEnd = async () => {
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.closeVoiceConnection(voice.id);
                    return;
                }
                status.index++;
                if (status.index >= status.list.audio.length) {
                    const newList = await this.list.get(status.list._id);
                    if (newList) {
                        if (status.mode === PlayMode.random) {
                            newList.audio.sort();
                            (0, shuffle_array_1.default)(newList.audio);
                        }
                        status.list = newList;
                        status.index = 0;
                    }
                    else {
                        this.playing.delete(voice.id);
                        return;
                    }
                }
                (0, PromiseUtils_1.retry)(() => this.play(voice, status)).catch(err => {
                    console.error(err);
                    this.playing.delete(voice.id);
                    voice.removeListener("end", onEnd);
                    voice.stopPlaying();
                });
            };
            voice.on("end", onEnd);
            voice.once("disconnect", err => {
                console.error(err);
                this.bot.closeVoiceConnection(voice.id);
                this.playing.delete(voice.id);
                voice.removeListener("end", onEnd);
                voice.stopPlaying();
            });
            void this.play(voice, this.playing.get(voice.id));
        }
    }
    commandNext(msg) {
        const voice = this.bot.voiceConnections.get(msg.guildID);
        if (voice) {
            voice.stopPlaying();
        }
        else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_NOTHING_PLAYING);
        }
    }
    commandBye(msg) {
        const voice = this.bot.voiceConnections.get(msg.guildID);
        if (voice) {
            this.bot.closeVoiceConnection(voice.id);
            this.playing.delete(voice.id);
        }
        else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_NOTHING_PLAYING);
        }
    }
    async commandRegister(msg, args) {
        if (args[0]) {
            try {
                await this.user.createFromToken(args[0], { type: exports.BIND_TYPE, id: msg.author.id });
            }
            catch (error) {
                void this.bot.createMessage(msg.channel.id, error.message);
                return;
            }
        }
        else {
            await this.user.create(msg.author.username, { type: exports.BIND_TYPE, id: msg.author.id });
        }
        const user = (await this.user.getFromBind(exports.BIND_TYPE, msg.author.id));
        void this.bot.createMessage(msg.channel.id, `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }
    async commandBind(msg) {
        const user = await this.user.getFromBind(exports.BIND_TYPE, msg.author.id);
        if (!user) {
            void this.bot.createMessage(msg.channel.id, "You are not register!");
            return;
        }
        void this.bot.createMessage(msg.channel.id, `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }
    async procseeFile(msg) {
        const user = await this.user.getFromBind(exports.BIND_TYPE, msg.author.id);
        if (!user)
            return;
        msg.attachments.forEach(async (file) => {
            let audio;
            try {
                audio = await this.audio.add(user._id, file.url);
            }
            catch (error) {
                if (error === AudioManager_1.ERR_NOT_AUDIO)
                    return;
                if (error === AudioManager_1.ERR_MISSING_TITLE)
                    audio = await this.audio.add(user._id, file.url, { title: file.filename });
                else
                    throw error;
            }
            void this.bot.createMessage(msg.channel.id, `ID: ${audio._id}\nTitle: ${audio.title}`);
        });
    }
    async play(voice, status) {
        if (!voice.ready)
            return;
        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio)
            throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio);
        if (!file)
            throw ERR_MISSING_AUDIO_FILE;
        voice.play(file, { format: "ogg", voiceDataTimeout: 15000 });
        const message = await this.genPlayingMessage(status.list, status.index);
        (0, PromiseUtils_1.retry)(() => status.statusMessage.edit(message)).catch(console.error);
    }
    async genPlayingMessage(list, index) {
        const now = await this.audio.get(list.audio[index]);
        const previous = (index > 0) ? await this.audio.get(list.audio[index - 1]) : null;
        const next = (index < list.audio.length) ? await this.audio.get(list.audio[index + 1]) : null;
        const fields = [];
        if (now)
            fields.push({ name: "__Now__", value: now.title });
        if (previous)
            fields.push({ name: "Previous", value: previous.title, inline: true });
        if (next)
            fields.push({ name: "Next", value: next.title, inline: true });
        return {
            embeds: [{
                    color: 4886754,
                    description: list.name,
                    fields,
                    title: "Playing"
                }]
        };
    }
}
exports.Discord = Discord;
