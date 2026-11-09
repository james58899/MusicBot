import { ObjectId, WithId } from "mongodb";
import shuffle from "shuffle-array";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, ERR_NOT_AUDIO, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry } from "../Core/Utils/PromiseUtils";
import { Client, Events, Message } from "@fluxerjs/core";
import { FluxerVoice, VoiceConnection } from "./FluxerVoice";

export const BIND_TYPE = "fluxer";
const ERR_MISSING_TOKEN = Error("Fluxer token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
const MESSAGE_VOICE_NOT_READY = "Voice connection not ready!";
const MESSAGE_NOTHING_PLAYING = "Nothing playing";

enum PlayMode {
    normal,
    random
}

interface IPlayingStatus {
    index: number;
    list: WithId<IAudioList>;
    mode: PlayMode;
    statusMessage: Message;
}

export class Fluxer {
    private config: any;
    // Assigned in init(); commands only arrive after login, so they're set by then
    private bot!: Client;
    private voice!: FluxerVoice;
    private audio: AudioManager;
    private list: ListManager;
    private user: UserManager;
    private playing = new Map<string, IPlayingStatus>();

    constructor(core: Core) {
        this.config = core.config.fluxer;

        if (!this.config?.token) throw ERR_MISSING_TOKEN;

        this.audio = core.audioManager;
        this.list = core.listManager;
        this.user = core.userManager;

        this.init().catch(err => console.error("[Fluxer] Init failed:", err));
    }

    private async init() {
        // Self-hosted instance: resolve API/gateway via /.well-known/fluxer; empty = hosted fluxer.app
        this.bot = this.config.endpoint ? await Client.fromDiscovery(this.config.endpoint as string) : new Client();
        // Must exist before login to receive voice states from READY/GUILD_CREATE
        this.voice = new FluxerVoice(this.bot);

        this.bot.on(Events.Ready, () => {
            console.log("[Fluxer] Ready!");
            this.bot.user?.setPresence({
                status: "online",
                activities: [{ name: "Self", type: 2 }]
            });
        });

        this.bot.on(Events.Error, err => console.error("[Fluxer] Error:", err));
        // A non-resumed reconnect drops our voice state; Fluxer then kicks the bot from LiveKit
        this.bot.on(Events.ShardDisconnect, (id, code) => console.warn(`[Fluxer] Gateway shard ${id} disconnected (${code})`));
        this.bot.on(Events.ShardResumed, id => console.log(`[Fluxer] Gateway shard ${id} resumed`));
        this.bot.on(Events.ShardReady, id => console.log(`[Fluxer] Gateway shard ${id} ready (new session)`));

        // this.bot.on(Events.MessageCreate, msg => {
        //     if (msg.attachments.size > 0) this.procseeFile(msg);
        // });

        this.registerCommand();

        await this.bot.login(this.config.token as string);
    }

    private registerCommand() {
        this.bot.on(Events.MessageCreate, (msg: Message) => {
            const [mention, cmd] = msg.content.split(" ");
            if (mention !== `<@${this.bot.user?.id}>`) return; // Fluxer has no intents, so filter "@bot cmd" ourselves
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

    private commandHi(msg: Message) {
        if (!msg.guildId) return;

        const channelId = this.voice.getVoiceChannelId(msg.guildId, msg.author.id);

        if (channelId) {
            this.voice.join(msg.guildId, channelId).catch(err => console.error("[Fluxer] join failed: ", err));
            void msg.send(MESSAGE_HI);
        } else {
            void msg.send(MESSAGE_HI_NOT_IN_VOICE);
        }
    }

    private async commandPlay(msg: Message, args: string[]) {
        if (!msg.guildId) return;
        const guildId = msg.guildId;
        const list = await this.list.get(new ObjectId(args[0]));
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

        // Init playing status
        let isPlaying = false;
        if (mode === PlayMode.random) shuffle(list.audio);
        if (this.playing.has(guildId)) isPlaying = true;
        this.playing.set(guildId, {
            index: 0,
            list,
            mode,
            statusMessage: await msg.send(await this.genPlayingMessage(list, 0))
        });

        // Start play
        if (!isPlaying) {
            const onEnd = async () => {
                // check status (deleted by bye/disconnect, which already leave)
                const status = this.playing.get(guildId);
                if (!status || !voice.isConnected()) return;

                // next
                status.index++;
                if (status.index >= status.list.audio.length) {
                    // refresh list
                    const newList = await this.list.get(status.list._id);
                    if (newList) {
                        if (status.mode === PlayMode.random) {
                            newList.audio.sort();
                            shuffle(newList.audio);
                        }
                        status.list = newList;
                        status.index = 0;
                    } else {
                        this.playing.delete(guildId);
                        return;
                    }
                }

                void playOrStop(status);
            };
            const playOrStop = (status: IPlayingStatus) => retry(() => this.play(voice, status)).catch(err => {
                console.error(err);

                // Delete play state
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

            void playOrStop(this.playing.get(guildId)!);
        }
    }

    private commandNext(msg: Message) {
        const voice = msg.guildId ? this.voice.getConnection(msg.guildId) : undefined;

        if (voice) {
            voice.stop();
        } else {
            void msg.send(MESSAGE_NOTHING_PLAYING);
        }
    }

    private commandBye(msg: Message) {
        const voice = msg.guildId ? this.voice.getConnection(msg.guildId) : undefined;

        if (voice) {
            // Delete first: leave() emits "end" synchronously
            this.playing.delete(msg.guildId!);
            this.voice.leave(msg.guildId!);
        } else {
            void msg.send(MESSAGE_NOTHING_PLAYING);
        }
    }

    private async commandRegister(msg: Message, args: string[]) {
        if (args[0]) {
            try {
                await this.user.createFromToken(args[0], { type: BIND_TYPE, id: msg.author.id });
            } catch (error) {
                void msg.send(error.message as string);
                return;
            }
        } else {
            await this.user.create(msg.author.username, { type: BIND_TYPE, id: msg.author.id });
        }

        const user = (await this.user.getFromBind(BIND_TYPE, msg.author.id))!;
        void msg.send(`ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }

    private async commandBind(msg: Message) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) {
            void msg.send("You are not register!");
            return;
        }

        void msg.send(`Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }

    // @ts-ignore: TODO
    private async procseeFile(msg: Message) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) return;

        msg.attachments.forEach(async file => {
            if (!file.url) return;
            let audio: WithId<IAudioData>;
            try {
                audio = await this.audio.add(user._id, file.url);
            } catch (error) {
                if (error === ERR_NOT_AUDIO) return;
                if (error === ERR_MISSING_TITLE) audio = await this.audio.add(user._id, file.url, { title: file.filename }); else throw error;
            }

            void msg.send(`ID: ${audio._id}\nTitle: ${audio.title}`);
        });
    }

    private async play(voice: VoiceConnection, status: IPlayingStatus) {
        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio) throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio);
        if (!file) throw ERR_MISSING_AUDIO_FILE;

        await voice.play(file);
        const message = await this.genPlayingMessage(status.list, status.index);
        retry(() => status.statusMessage.edit(message)).catch(console.error);
    }

    private async genPlayingMessage(list: IAudioList, index: number) {
        const now = await this.audio.get(list.audio[index]);
        const previous = (index > 0) ? await this.audio.get(list.audio[index - 1]) : null;
        const next = (index < list.audio.length) ? await this.audio.get(list.audio[index + 1]) : null;
        const fields = [];

        if (now) fields.push({ name: "__Now__", value: now.title });
        if (previous) fields.push({ name: "Previous", value: previous.title, inline: true });
        if (next) fields.push({ name: "Next", value: next.title, inline: true });

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
