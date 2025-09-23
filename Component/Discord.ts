import { ObjectId, WithId } from "mongodb";
import shuffle from "shuffle-array";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, ERR_NOT_AUDIO, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";
import { retry } from "../Core/Utils/PromiseUtils";
import { Client, Message, MessageContent, PossiblyUncachedTextableChannel, VoiceConnection } from "@projectdysnomia/dysnomia";

export const BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
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

export class Discord {
    private config: any;
    private bot: Client;
    private audio: AudioManager;
    private list: ListManager;
    private user: UserManager;
    private playing = new Map<string, IPlayingStatus>();

    constructor(core: Core) {
        this.config = core.config.discord;

        if (!this.config.token) throw ERR_MISSING_TOKEN;

        this.bot = new Client(
            this.config.token as string,
            {
                gateway: {
                    intents: ['guilds', 'guildMessages', 'guildVoiceStates'],
                }
            }
        );
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
            console.error(`[Discord] Error ${id}: ${err}`)
        })

        // this.bot.on("messageCreate", msg => {
        //     if (msg.attachments.length > 0) this.procseeFile(msg);
        // });

        this.registerCommand();

        void this.bot.connect();
    }

    // TODO switch to discord native command
    private registerCommand() {
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

    private commandHi(msg: Message<PossiblyUncachedTextableChannel>) {
        if (!msg.member) return;

        if (msg.member.voiceState.channelID) {
            void this.bot.joinVoiceChannel(msg.member.voiceState.channelID, { opusOnly: true }).then(voice => {
                voice.on('warn', msg => console.error(`[Discord] warn: ${msg}`));
                voice.on('error', err => console.error("[Discord] error: ", err));
            });
            void this.bot.createMessage(msg.channel.id, MESSAGE_HI);
        } else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_HI_NOT_IN_VOICE);
        }
    }

    private async commandPlay(msg: Message<PossiblyUncachedTextableChannel>, args: string[]) {
        const list = await this.list.get(new ObjectId(args[0]));
        const voice = this.bot.voiceConnections.get(msg.guildID!);
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

        // Init playing status
        let isPlaying = false;
        if (mode === PlayMode.random) shuffle(list.audio);
        if (this.playing.has(voice.id)) isPlaying = true;
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0) as MessageContent<"hasNonce">)
        });

        // Start play
        if (!isPlaying) {
            const onEnd = async () => {
                // check status
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.closeVoiceConnection(voice.id)
                    return;
                }

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
                        this.playing.delete(voice.id);
                        return;
                    }
                }

                retry(() => this.play(voice, status)).catch(err => {
                    console.error(err)

                    // Deletet play state
                    this.playing.delete(voice.id);
                    voice.removeListener("end", onEnd)
                    voice.stopPlaying()
                });
            }
            voice.on("end", onEnd);
            voice.once("disconnect", err => {
                console.error(err)
                this.bot.closeVoiceConnection(voice.id)
                this.playing.delete(voice.id);
                voice.removeListener("end", onEnd)
                voice.stopPlaying()
            })

            void this.play(voice, this.playing.get(voice.id)!);
        }
    }

    private commandNext(msg: Message<PossiblyUncachedTextableChannel>) {
        const voice = this.bot.voiceConnections.get(msg.guildID!);

        if (voice) {
            voice.stopPlaying();
        } else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_NOTHING_PLAYING);
        }
    }

    private commandBye(msg: Message<PossiblyUncachedTextableChannel>) {
        const voice = this.bot.voiceConnections.get(msg.guildID!);

        if (voice) {
            this.bot.closeVoiceConnection(voice.id)
            this.playing.delete(voice.id);
        } else {
            void this.bot.createMessage(msg.channel.id, MESSAGE_NOTHING_PLAYING);
        }
    }

    private async commandRegister(msg: Message<PossiblyUncachedTextableChannel>, args: string[]) {
        if (args[0]) {
            try {
                await this.user.createFromToken(args[0], { type: BIND_TYPE, id: msg.author.id });
            } catch (error) {
                void this.bot.createMessage(msg.channel.id, error.message as string);
                return;
            }
        } else {
            await this.user.create(msg.author.username, { type: BIND_TYPE, id: msg.author.id });
        }

        const user = (await this.user.getFromBind(BIND_TYPE, msg.author.id))!;
        void this.bot.createMessage(msg.channel.id, `ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }

    private async commandBind(msg: Message<PossiblyUncachedTextableChannel>) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) {
            void this.bot.createMessage(msg.channel.id, "You are not register!");
            return;
        }

        void this.bot.createMessage(msg.channel.id, `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }

    // @ts-ignore: TODO
    private async procseeFile(msg: Message<PossiblyUncachedTextableChannel>) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) return;

        msg.attachments.forEach(async file => {
            let audio: WithId<IAudioData>;
            try {
                audio = await this.audio.add(user._id, file.url);
            } catch (error) {
                if (error === ERR_NOT_AUDIO) return;
                if (error === ERR_MISSING_TITLE) audio = await this.audio.add(user._id, file.url, { title: file.filename }); else throw error;
            }

            void this.bot.createMessage(msg.channel.id, `ID: ${audio._id}\nTitle: ${audio.title}`);
        });
    }

    private async play(voice: VoiceConnection, status: IPlayingStatus) {
        if (!voice.ready) return;

        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio) throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio);
        if (!file) throw ERR_MISSING_AUDIO_FILE;

        voice.play(file, { format: "ogg", voiceDataTimeout: 15000 });
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
        } as MessageContent;
    }
}
