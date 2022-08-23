"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Core = void 0;
const events_1 = require("events");
const fs_1 = require("fs");
const path_1 = require("path");
const Discord_1 = require("./Component/Discord");
const Telegram_1 = require("./Component/Telegram");
const AudioManager_1 = require("./Core/AudioManager");
const ListManager_1 = require("./Core/ListManager");
const MongoDB_1 = require("./Core/MongoDB");
const UserManager_1 = require("./Core/UserManager");
class Core extends events_1.EventEmitter {
    constructor() {
        super();
        this.config = require((0, path_1.resolve)("config.json"));
        this.audioManager = new AudioManager_1.AudioManager(this);
        this.userManager = new UserManager_1.UserManager(this);
        this.listManager = new ListManager_1.ListManager(this);
        this.database = new MongoDB_1.MongoDB(this.config);
        this.emit("init", this);
        if (!(0, fs_1.existsSync)((0, path_1.resolve)(this.config.audio.save)))
            (0, fs_1.mkdirSync)((0, path_1.resolve)(this.config.audio.save));
        this.database.on("connect", () => this.emit("ready"));
        this.on("ready", async () => {
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
            await this.audioManager.checkCache(process.argv.indexOf("--deep-check") !== -1);
            await this.listManager.checkAudioExist();
            if (process.argv.indexOf("--cleanup-audio") !== -1) {
                console.log("[Cleanup] Starting clean up audio not in any list");
                for await (const audio of this.audioManager.search()) {
                    if (audio && !await this.listManager.audioInList(audio._id)) {
                        console.log(`[Cleanup] Delete ${audio.title} not in any list`);
                        await this.audioManager.delete(audio._id);
                    }
                }
            }
        });
    }
}
exports.Core = Core;
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('SIGINT', () => {
    process.exit();
});
new Core();
