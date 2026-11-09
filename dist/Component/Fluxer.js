"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Fluxer = exports.BIND_TYPE = void 0;
const mongodb_1 = require("mongodb");
const shuffle_array_1 = __importDefault(require("shuffle-array"));
const AudioManager_1 = require("../Core/AudioManager");
const PromiseUtils_1 = require("../Core/Utils/PromiseUtils");
const core_1 = require("@fluxerjs/core");
const FluxerVoice_1 = require("./FluxerVoice");
exports.BIND_TYPE = "fluxer";
const ERR_MISSING_TOKEN = Error("Fluxer token missing");
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
class Fluxer {
    constructor(core) {
        this.playing = new Map();
        this.config = core.config.fluxer;
        if (!this.config?.token)
            throw ERR_MISSING_TOKEN;
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.user = core.userManager;
        this.init().catch(err => console.error("[Fluxer] Init failed:", err));
    }
    async init() {
        this.bot = this.config.endpoint ? await core_1.Client.fromDiscovery(this.config.endpoint) : new core_1.Client();
        this.voice = new FluxerVoice_1.FluxerVoice(this.bot);
        this.bot.on(core_1.Events.Ready, () => {
            console.log("[Fluxer] Ready!");
            this.bot.user?.setPresence({
                status: "online",
                activities: [{ name: "Self", type: 2 }]
            });
        });
        this.bot.on(core_1.Events.Error, err => console.error("[Fluxer] Error:", err));
        this.bot.on(core_1.Events.ShardDisconnect, (id, code) => console.warn(`[Fluxer] Gateway shard ${id} disconnected (${code})`));
        this.bot.on(core_1.Events.ShardResumed, id => console.log(`[Fluxer] Gateway shard ${id} resumed`));
        this.bot.on(core_1.Events.ShardReady, id => console.log(`[Fluxer] Gateway shard ${id} ready (new session)`));
        this.registerCommand();
        await this.bot.login(this.config.token);
    }
    registerCommand() {
        this.bot.on(core_1.Events.MessageCreate, (msg) => {
            const [mention, cmd] = msg.content.split(" ");
            if (mention !== `<@${this.bot.user?.id}>`)
                return;
            switch (cmd) {
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
        if (!msg.guildId)
            return;
        const channelId = this.voice.getVoiceChannelId(msg.guildId, msg.author.id);
        if (channelId) {
            this.voice.join(msg.guildId, channelId).catch(err => console.error("[Fluxer] join failed: ", err));
            void msg.send(MESSAGE_HI);
        }
        else {
            void msg.send(MESSAGE_HI_NOT_IN_VOICE);
        }
    }
    async commandPlay(msg, args) {
        if (!msg.guildId)
            return;
        const guildId = msg.guildId;
        const list = await this.list.get(new mongodb_1.ObjectId(args[0]));
        const voice = this.voice.getConnection(guildId);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;
        if (!list) {
            void msg.send(MESSAGE_LIST_NOT_FOUND);
            return;
        }
        if (!voice) {
            void msg.send(MESSAGE_NOT_IN_VOICE);
            return;
        }
        if (!voice.isConnected()) {
            void msg.send(MESSAGE_VOICE_NOT_READY);
            return;
        }
        let isPlaying = false;
        if (mode === PlayMode.random)
            (0, shuffle_array_1.default)(list.audio);
        if (this.playing.has(guildId))
            isPlaying = true;
        this.playing.set(guildId, {
            index: 0,
            list,
            mode,
            statusMessage: await msg.send(await this.genPlayingMessage(list, 0))
        });
        if (!isPlaying) {
            const onEnd = async () => {
                const status = this.playing.get(guildId);
                if (!status || !voice.isConnected())
                    return;
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
                        this.playing.delete(guildId);
                        return;
                    }
                }
                void playOrStop(status);
            };
            const playOrStop = (status) => (0, PromiseUtils_1.retry)(() => this.play(voice, status)).catch(err => {
                console.error(err);
                this.playing.delete(guildId);
                voice.removeListener("end", onEnd);
                voice.stop();
            });
            voice.on("end", onEnd);
            voice.once("disconnect", () => {
                this.playing.delete(guildId);
                voice.removeListener("end", onEnd);
                voice.stop();
            });
            void playOrStop(this.playing.get(guildId));
        }
    }
    commandNext(msg) {
        const voice = msg.guildId ? this.voice.getConnection(msg.guildId) : undefined;
        if (voice) {
            voice.stop();
        }
        else {
            void msg.send(MESSAGE_NOTHING_PLAYING);
        }
    }
    commandBye(msg) {
        const voice = msg.guildId ? this.voice.getConnection(msg.guildId) : undefined;
        if (voice) {
            this.playing.delete(msg.guildId);
            this.voice.leave(msg.guildId);
        }
        else {
            void msg.send(MESSAGE_NOTHING_PLAYING);
        }
    }
    async commandRegister(msg, args) {
        if (args[0]) {
            try {
                await this.user.createFromToken(args[0], { type: exports.BIND_TYPE, id: msg.author.id });
            }
            catch (error) {
                void msg.send(error.message);
                return;
            }
        }
        else {
            await this.user.create(msg.author.username, { type: exports.BIND_TYPE, id: msg.author.id });
        }
        const user = (await this.user.getFromBind(exports.BIND_TYPE, msg.author.id));
        void msg.send(`ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }
    async commandBind(msg) {
        const user = await this.user.getFromBind(exports.BIND_TYPE, msg.author.id);
        if (!user) {
            void msg.send("You are not register!");
            return;
        }
        void msg.send(`Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }
    async procseeFile(msg) {
        const user = await this.user.getFromBind(exports.BIND_TYPE, msg.author.id);
        if (!user)
            return;
        msg.attachments.forEach(async (file) => {
            if (!file.url)
                return;
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
            void msg.send(`ID: ${audio._id}\nTitle: ${audio.title}`);
        });
    }
    async play(voice, status) {
        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio)
            throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio);
        if (!file)
            throw ERR_MISSING_AUDIO_FILE;
        await voice.play(file);
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
exports.Fluxer = Fluxer;
