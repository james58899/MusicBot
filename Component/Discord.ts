import { CommandClient, Message, MessageContent, TextChannel, VoiceConnection } from "eris";
import { ObjectId } from "mongodb";
import shuffle from "shuffle-array";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, ERR_NOT_AUDIO, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { IUserData, UserManager } from "../Core/UserManager";

export const BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const MESSAGE_HI = "Hi!\nWant some music?";
const MESSAGE_HI_NOT_IN_VOICE = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";
const MESSAGE_NOT_IN_VOICE = "You should say hi to me first!";
const MESSAGE_NOTHING_PLAYING = "Nothing playing";

enum PlayMode {
    normal,
    random
}

interface IPlayingStatus {
    index: number;
    list: IAudioList;
    mode: PlayMode;
    statusMessage: Message;
}

export class Discord {
    private config: any;
    private bot: CommandClient;
    private audio: AudioManager;
    private list: ListManager;
    private user: UserManager;
    private playing = new Map<string, IPlayingStatus>();

    constructor(core: Core) {
        this.config = core.config.discord;

        if (!this.config.token) throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(
            this.config.token,
            { opusOnly: true },
            { defaultCommandOptions: { caseInsensitive: true }, owner: this.config.owner }
        );
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
        
        this.bot.on("error", (err, id) => {
            console.error(`[Discord] Error ${id}: ${err}`)
        })

        // this.bot.on("messageCreate", msg => {
        //     if (msg.attachments.length > 0) this.procseeFile(msg);
        // });

        this.registerCommand();

        void this.bot.connect();
    }

    private registerCommand() {
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

    private commandHi(msg: Message) {
        if (!msg.member) return;

        if (msg.member.voiceState.channelID) {
            void this.bot.joinVoiceChannel(msg.member.voiceState.channelID);
            void msg.channel.createMessage(MESSAGE_HI);
        } else {
            void msg.channel.createMessage(MESSAGE_HI_NOT_IN_VOICE);
        }
    }

    private async commandPlay(msg: Message, args: string[]) {
        const list = await this.list.get(new ObjectId(args[0]));
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;

        if (!list) {
            void msg.channel.createMessage(MESSAGE_LIST_NOT_FOUND);
            return;
        }

        if (!voice) {
            void msg.channel.createMessage(MESSAGE_NOT_IN_VOICE);
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
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
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
                        if (status.mode === PlayMode.random) shuffle(newList.audio);
                        status.list = newList;
                        status.index = 0;
                    } else {
                        this.playing.delete(voice.id);
                        return;
                    }
                }

                void this.play(voice, status);
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

    private commandNext(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            voice.stopPlaying();
        } else {
            void msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }

    private commandBye(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            this.bot.closeVoiceConnection(voice.id)
            this.playing.delete(voice.id);
        } else {
            void msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }

    private async commandRegister(msg: Message, args: string[]) {
        let user: IUserData;
        if (args[0]) {
            try {
                user = await this.user.createFromToken(args[0], { type: BIND_TYPE, id: msg.author.id });
            } catch (error) {
                void msg.channel.createMessage(error.message);
                return;
            }
        } else {
            user = await this.user.create(msg.author.username, { type: BIND_TYPE, id: msg.author.id });
        }

        void msg.channel.createMessage(`ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }

    private async commandBind(msg: Message) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) {
            void this.bot.createMessage(msg.channel.id, "You are not register!");
            return;
        }

        void this.bot.createMessage(msg.channel.id, `Register token: ${this.user.createBindToken(user._id)}\nExpires after one hour`);
    }

    // @ts-ignore: TODO
    private async procseeFile(msg: Message) {
        const user = await this.user.getFromBind(BIND_TYPE, msg.author.id);

        if (!user) return;

        msg.attachments.forEach(async file => {
            let audio: IAudioData;
            try {
                audio = await this.audio.add(user._id, file.url);
            } catch (error) {
                if (error === ERR_NOT_AUDIO) return;
                if (error === ERR_MISSING_TITLE) audio = await this.audio.add(user._id, file.url, { title: file.filename }); else throw error;
            }

            void msg.channel.createMessage(`ID: ${audio._id}\nTitle: ${audio.title}`);
        });
    }

    private async play(voice: VoiceConnection, status: IPlayingStatus) {
        if (!voice.ready) return;

        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio) throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio);
        if (!file) throw ERR_MISSING_AUDIO_FILE;

        voice.play(file, { format: "ogg" });
        void status.statusMessage.edit(await this.genPlayingMessage(status.list, status.index));
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
            embed: {
                color: 4886754,
                description: list.name,
                fields,
                title: "Playing"
            }
        } as MessageContent;
    }
}
