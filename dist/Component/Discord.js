"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bson_1 = require("bson");
const eris_1 = require("eris");
const shuffle_array_1 = __importDefault(require("shuffle-array"));
const AudioManager_1 = require("../Core/AudioManager");
exports.BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
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
        this.bot = new eris_1.CommandClient(this.config.token, { opusOnly: true }, { defaultCommandOptions: { caseInsensitive: true }, owner: this.config.owner });
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.user = core.userManager;
        this.bot.on("ready", () => {
            console.log("[Discord] Ready!");
            this.bot.editStatus(undefined, {
                name: "Self",
                type: 2
            });
        });
        this.bot.on("messageCreate", msg => {
            if (msg.attachments.length > 0)
                this.procseeFile(msg);
        });
        this.registerCommand();
        this.bot.connect();
    }
    async registerCommand() {
        this.bot.registerCommand("hi", this.commandHi.bind(this), {
            description: "Say Hi! make bot join voice channel",
            guildOnly: true,
        });
        this.bot.registerCommand("play", this.commandPlay.bind(this), {
            argsRequired: true,
            description: "Start play music playlist",
            guildOnly: true,
            usage: "<playlist> [random]"
        });
        this.bot.registerCommand("next", this.commandNext.bind(this), {
            description: "Next sound!",
            guildOnly: true,
        });
        this.bot.registerCommand("bye", this.commandBye.bind(this), {
            description: "Stop play and leave voice channel",
            guildOnly: true
        });
        this.bot.registerCommand("register", this.commandRegister.bind(this), {
            description: "Register or bind account",
            usage: "[token]"
        });
        this.bot.registerCommand("bind", this.commandBind.bind(this), {
            description: "Generate bind token"
        });
    }
    async commandHi(msg) {
        if (!msg.member)
            return;
        if (msg.member.voiceState.channelID) {
            this.bot.joinVoiceChannel(msg.member.voiceState.channelID);
            msg.channel.createMessage(MESSAGE_HI);
        }
        else {
            msg.channel.createMessage(MESSAGE_HI_NOT_IN_VOICE);
        }
    }
    async commandPlay(msg, args) {
        const list = await this.list.get(new bson_1.ObjectID(args[0]));
        const voice = this.bot.voiceConnections.get(msg.channel.guild.id);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;
        if (!list) {
            msg.channel.createMessage(MESSAGE_LIST_NOT_FOUND);
            return;
        }
        if (!voice) {
            msg.channel.createMessage(MESSAGE_NOT_IN_VOICE);
            return;
        }
        let isPlaying = false;
        if (mode === PlayMode.random)
            shuffle_array_1.default(list.audio);
        if (this.playing.has(voice.id))
            isPlaying = true;
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
        });
        if (!isPlaying) {
            this.play(voice, this.playing.get(voice.id));
            voice.on("end", async () => {
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.leaveVoiceChannel(voice.channelID);
                    return;
                }
                status.index++;
                if (status.index >= status.list.audio.length) {
                    const newList = await this.list.get(status.list._id);
                    if (newList) {
                        status.list = newList;
                    }
                    else {
                        this.playing.delete(voice.id);
                        return;
                    }
                    if (status.mode === PlayMode.random)
                        shuffle_array_1.default(status.list.audio);
                    status.index = 0;
                }
                this.play(voice, status);
            });
        }
    }
    commandNext(msg) {
        const voice = this.bot.voiceConnections.get(msg.channel.guild.id);
        if (voice) {
            voice.stopPlaying();
        }
        else {
            msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }
    commandBye(msg) {
        const voice = this.bot.voiceConnections.get(msg.channel.guild.id);
        if (voice) {
            this.bot.leaveVoiceChannel(voice.channelID);
            this.playing.delete(voice.id);
        }
        else {
            msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }
    async commandRegister(msg, args) {
        let user;
        if (args[0]) {
            try {
                user = await this.user.createFromToken(args[0], { type: exports.BIND_TYPE, id: msg.author.id });
            }
            catch (error) {
                msg.channel.createMessage(error.message);
                return;
            }
        }
        else {
            user = await this.user.create(msg.author.username, { type: exports.BIND_TYPE, id: msg.author.id });
        }
        msg.channel.createMessage(`ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }
    async commandBind(msg) {
        const user = await this.user.get(exports.BIND_TYPE, msg.author.id);
        if (!user) {
            this.bot.createMessage(msg.channel.id, "You are not register!");
            return;
        }
        this.bot.createMessage(msg.channel.id, `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }
    async procseeFile(msg) {
        const user = await this.user.get(exports.BIND_TYPE, msg.author.id);
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
            msg.channel.createMessage(`ID: ${audio._id}\nTitle: ${audio.title}`);
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
        voice.play(file, { format: "ogg" });
        status.statusMessage.edit(await this.genPlayingMessage(status.list, status.index));
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
            embed: {
                color: 4886754,
                description: list.name,
                fields,
                title: "Playing"
            }
        };
    }
}
exports.Discord = Discord;
//# sourceMappingURL=Discord.js.map