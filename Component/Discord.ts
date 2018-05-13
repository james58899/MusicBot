import { ObjectID } from "bson";
import { CommandClient, Message, MessageContent, TextChannel, VoiceConnection } from "eris";
import shuffle from "shuffle-array";
import { Core } from "..";
import { AudioManager, ERR_MISSING_DURATION, ERR_MISSING_TITLE, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { IUserData, UserManager } from "../Core/UserManager";

export const BIND_TYPE = "discord";
const ERR_MISSING_TOKEN = Error("Discord token missing");
const ERR_CAN_NOT_GET_LIST = Error("Can not get playlist from database");
const ERR_CAN_NOT_GET_AUDIO = Error("Can not get audio from database");
const ERR_MISSING_AUDIO_FILE = Error("Audio missing in cache");
const ERR_NOT_REGISTER = "Please register or bind account!";
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

        this.bot.on("messageCreate", msg => {
            if (msg.attachments.length > 0) this.procseeFile(msg);
        });

        this.registerCommand();

        this.bot.connect();
    }

    private async registerCommand() {
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
    }

    private async commandHi(msg: Message) {
        if (!msg.member) return;

        if (msg.member.voiceState.channelID) {
            this.bot.joinVoiceChannel(msg.member.voiceState.channelID);
            msg.channel.createMessage(MESSAGE_HI);
        } else {
            msg.channel.createMessage(MESSAGE_HI_NOT_IN_VOICE);
        }
    }

    private async commandPlay(msg: Message, args: string[]) {
        const channel = msg.channel as TextChannel;
        const list = await this.list.get(new ObjectID(args[0]));
        const voice = this.bot.voiceConnections.get(channel.guild.id);
        const mode = (args[1]) ? ((args[1].toLocaleLowerCase() === "random") ? PlayMode.random : PlayMode.normal) : PlayMode.normal;

        if (!list) {
            msg.channel.createMessage(MESSAGE_LIST_NOT_FOUND);
            return;
        }

        if (!voice) {
            msg.channel.createMessage(MESSAGE_NOT_IN_VOICE);
            return;
        }

        // Init playing status
        if (mode === PlayMode.random) shuffle(list.audio);
        this.playing.set(voice.id, {
            index: 0,
            list,
            mode,
            statusMessage: await this.bot.createMessage(msg.channel.id, await this.genPlayingMessage(list, 0))
        });

        // Start play
        if (!voice.playing) {
            this.play(voice, this.playing.get(voice.id)!);
            voice.on("end", async () => {
                // check status
                const status = this.playing.get(voice.id);
                if (!status) {
                    this.bot.leaveVoiceChannel(voice.channelID);
                    return;
                }

                // next
                status.index++;
                if (status.index >= status.list.audio.length) {
                    // refresh list
                    const newList = await this.list.get(status.list._id);
                    if (newList) status.list = newList; else throw ERR_CAN_NOT_GET_LIST;
                    if (status.mode === PlayMode.random) shuffle(newList.audio);
                    status.index = 0;
                }

                this.play(voice, status);
            });
        }
    }

    private commandNext(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            voice.stopPlaying();
        } else {
            msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }

    private commandBye(msg: Message) {
        const voice = this.bot.voiceConnections.get((msg.channel as TextChannel).guild.id);

        if (voice) {
            this.bot.leaveVoiceChannel(voice.channelID);
        } else {
            msg.channel.createMessage(MESSAGE_NOTHING_PLAYING);
        }
    }

    private async commandRegister(msg: Message, args: string[]) {
        let user: IUserData;
        if (args[0]) {
            try {
                user = await this.user.createFromToken(args[0], { type: BIND_TYPE, id: msg.author.id });
            } catch (error) {
                msg.channel.createMessage(error.message);
                return;
            }
        } else {
            user = await this.user.create(msg.author.username, { type: BIND_TYPE, id: msg.author.id });
        }

        msg.channel.createMessage(`ID: ${user._id}\nName: ${user.name}\nBind: ${user.bind.map(i => `${i.type}(${i.id})`).join(", ")}`);
    }

    private async procseeFile(msg: Message) {
        const user = await this.user.get(BIND_TYPE, msg.author.id);

        if (!user) {
            msg.channel.createMessage(ERR_NOT_REGISTER);
            return;
        }

        msg.attachments.forEach(async file => {
            let audio: IAudioData;
            try {
                audio = await this.audio.add(user._id, file.url);
            } catch (error) {
                if (error === ERR_MISSING_DURATION) return;
                if (error === ERR_MISSING_TITLE) audio = await this.audio.add(user._id, file.url, { title: file.filename }); else throw error;
            }

            msg.channel.createMessage(`編號： ${audio._id}\n標題： ${audio.title}`);
        });
    }

    private async play(voice: VoiceConnection, status: IPlayingStatus) {
        if (!voice.ready) return;

        const audio = await this.audio.get(status.list.audio[status.index]);
        if (!audio) throw ERR_CAN_NOT_GET_AUDIO;
        const file = await this.audio.getFile(audio!);
        if (!file) throw ERR_MISSING_AUDIO_FILE;

        voice.play(file, { format: "ogg" });
        status.statusMessage.edit(await this.genPlayingMessage(status.list, status.index));
    }

    private async genPlayingMessage(list: IAudioList, index: number) {
        const now = await this.audio.get(list.audio[index]);
        const previous = (index > 0) ? await this.audio.get(list.audio[index - 1]) : null;
        const next = (index < list.audio.length) ? await this.audio.get(list.audio[index + 1]) : null;
        const fields = [];

        if (now) fields.push({name: "__Now__", value: now.title});
        if (previous) fields.push({name: "Previous", value: previous.title, inline: true});
        if (next) fields.push({name: "Next", value: next.title, inline: true});

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
