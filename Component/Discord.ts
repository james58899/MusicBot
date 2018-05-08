import { ObjectID } from "bson";
import { CommandClient, Message, TextChannel, VoiceConnection } from "eris";
import { Core } from "..";
import { AudioManager } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { UserManager } from "../Core/UserManager";

const ERR_MISSING_TOKEN = Error("Discord token missing");
const MESSAGE_HI = "Hi!\nYou are not in voice channel, so only can say hi using text.";
const MESSAGE_LIST_NOT_FOUND = "Play list not found!";

export class Discord {
    private config: any;
    private bot: CommandClient;
    private user: UserManager;
    private audio: AudioManager;
    private list: ListManager;

    constructor(core: Core) {
        this.config = core.config.discord;

        if (!this.config.token) throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(this.config.token, undefined, {
            defaultCommandOptions: {
                caseInsensitive: true
            },
            owner: "wow" // TODO owner name
        });
        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;

        this.bot.on("ready", () => {
            console.log("[Discord] Ready!");
        });

        this.bot.on("messageCreate", msg => {
            if (msg.attachments.length > 0) this.procseeFile(msg);
        });

        this.registerCommand();

        this.bot.connect();
    }

    private async registerCommand() {
        this.bot.registerCommand("hi", this.joinVoiceChannel.bind(this), { guildOnly: true });
        this.bot.registerCommand("play", this.commandPlay.bind(this), { guildOnly: true });
    }

    private async joinVoiceChannel(msg: Message) {
        if (!msg.member) return;

        if (this.bot.voiceConnections.find(conn => conn.id === (msg.channel as TextChannel).guild.id)) return;

        if (msg.member.voiceState.channelID) {
            this.bot.joinVoiceChannel(msg.member.voiceState.channelID);
        } else {
            this.bot.createMessage(msg.channel.id, MESSAGE_HI);
        }
    }

    private async commandPlay(msg: Message, args: string[]) {
        const list = await this.list.get(new ObjectID(args[0]));
        const voice = this.bot.voiceConnections.find(conn => conn.id === (msg.channel as TextChannel).guild.id);

        if (!list) {
            this.bot.createMessage(msg.channel.id, MESSAGE_LIST_NOT_FOUND);
            return;
        }

        if (voice) {
            this.playList(voice, list);
        } else {
            if (msg.member && msg.member.voiceState.channelID) {
                this.playList(await this.bot.joinVoiceChannel(msg.member!.voiceState.channelID!), list);
            }
        }
    }

    private async playList(voice: VoiceConnection, list: IAudioList) { // TODO random play
        let index = 0;
        let file = await this.audio.getFile((await this.audio.get(list.audio[index]))!); // TODO null check

        voice.on("end", async () => {
            index++;
            file = await this.audio.getFile((await this.audio.get(list.audio[index]))!); // TODO null check
            if (file) voice.play(file, { format: "ogg" });
        });

        voice.on("disconnect", () => voice.removeAllListeners());

        if (file) voice.play(file, { format: "ogg" });
    }

    private async procseeFile(msg: Message) {
        // TODO
    }
}
