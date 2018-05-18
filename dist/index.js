"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const Discord_1 = require("./Component/Discord");
const Telegram_1 = require("./Component/Telegram");
const AudioManager_1 = require("./Core/AudioManager");
const ListManager_1 = require("./Core/ListManager");
const MongoDB_1 = require("./Core/MongoDB");
const UserManager_1 = require("./Core/UserManager");
class Core {
    constructor() {
        this.config = require(path_1.resolve("config.json"));
        this.database = new MongoDB_1.MongoDB(this.config);
        this.audioManager = new AudioManager_1.AudioManager(this);
        this.userManager = new UserManager_1.UserManager(this);
        this.listManager = new ListManager_1.ListManager(this);
        if (!fs_1.existsSync(path_1.resolve(this.config.audio.save)))
            fs_1.mkdirSync(path_1.resolve(this.config.audio.save));
        this.database.on("connect", () => {
            new Telegram_1.Telegram(this);
            new Discord_1.Discord(this);
            if (process.argv.indexOf("--deep-check") !== -1) {
                this.audioManager.checkCache(true);
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