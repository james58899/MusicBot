"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Core = void 0;
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = require("path");
const Discord_1 = require("./Component/Discord");
const Telegram_1 = require("./Component/Telegram");
const Web_1 = require("./Component/Web");
const AudioManager_1 = require("./Core/AudioManager");
const ListManager_1 = require("./Core/ListManager");
const MongoDB_1 = require("./Core/MongoDB");
const UserManager_1 = require("./Core/UserManager");
class Core extends events_1.EventEmitter {
    constructor() {
        super();
        this.config = require(path_1.resolve("config.json"));
        this.audioManager = new AudioManager_1.AudioManager(this);
        this.userManager = new UserManager_1.UserManager(this);
        this.listManager = new ListManager_1.ListManager(this);
        this.database = new MongoDB_1.MongoDB(this.config);
        this.emit("init", this);
        if (!fs_1.existsSync(path_1.resolve(this.config.audio.save)))
            fs_1.mkdirSync(path_1.resolve(this.config.audio.save));
        this.database.on("connect", () => this.emit("ready"));
        this.on("ready", async () => {
            if (process.argv.indexOf("--deep-check") !== -1) {
                await this.audioManager.checkCache(true);
                this.listManager.checkAudioExist();
            }
            else {
                this.audioManager.checkCache();
            }
            if (process.argv.indexOf("--cleanup-audio") !== -1) {
                console.log("[Cleanup] Starting clean up audio not in any list");
                await this.audioManager.search().forEach(async (audio) => {
                    if (!await this.listManager.audioInList(audio._id)) {
                        console.log(`[Cleanup] Delete ${audio.title} not in any list`);
                        this.audioManager.delete(audio._id);
                    }
                });
            }
            console.log("[Main] Init components...");
            try {
                new Telegram_1.Telegram(this);
            }
            catch (error) {
                console.error(error);
            }
            try {
                new Discord_1.Discord(this);
            }
            catch (error) {
                console.error(error);
            }
            try {
                new Web_1.Web(this);
            }
            catch (error) {
                console.error(error);
            }
        });
    }
}
exports.Core = Core;
process.on('SIGINT', () => {
    process.exit();
});
new Core();
