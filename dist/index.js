"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        this.config = require(path_1.resolve("config.json"));
        this.database = new MongoDB_1.MongoDB(this.config);
        this.audioManager = new AudioManager_1.AudioManager(this);
        this.userManager = new UserManager_1.UserManager(this);
        this.listManager = new ListManager_1.ListManager(this);
        this.emit("init", this);
        if (!fs_1.existsSync(path_1.resolve(this.config.audio.save)))
            fs_1.mkdirSync(path_1.resolve(this.config.audio.save));
        this.database.on("connect", () => this.emit("ready"));
        this.on("ready", async () => {
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
            if (process.argv.indexOf("--deep-check") !== -1) {
                await this.audioManager.checkCache(true);
                this.listManager.checkAudioExist();
            }
            else {
                this.audioManager.checkCache();
            }
        });
    }
}
exports.Core = Core;
new Core();
//# sourceMappingURL=index.js.map