import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { Discord } from "./Component/Discord";
import { Telegram } from "./Component/Telegram";
import { AudioManager } from "./Core/AudioManager";
import { ListManager } from "./Core/ListManager";
import { MongoDB } from "./Core/MongoDB";
import { UserManager } from "./Core/UserManager";

export class Core {
    public readonly config = require(resolve("config.json"));
    public readonly database = new MongoDB(this.config);
    public readonly audioManager = new AudioManager(this);
    public readonly userManager = new UserManager(this);
    public readonly listManager = new ListManager(this);

    constructor() {
        if (!existsSync(resolve(this.config.audio.save))) mkdirSync(resolve(this.config.audio.save));

        // Wait DB connect
        this.database.on("connect", () => {
            // this.cleanFiles();
            // tslint:disable-next-line:no-unused-expression
            new Telegram(this);
            // tslint:disable-next-line:no-unused-expression
            new Discord(this);
        });
    }

    // private async cleanFiles() {
    //     readdir(resolve(this.config.audio.save)).then(async files => {
    //         for (const file of files) {
    //             const hash = file.replace('.opus', '');
    //             const cursor = await this.database.audio.search({ hash: hash });
    //             if (await cursor.count() === 0) {
    //                 unlink(resolve(this.config.audio.save, file), () => {
    //                     console.log('[Core] Deleted not exist file: ', file);
    //                 });
    //             }
    //         }
    //     });
    // }

    // private async checkMissFile() {
    //     (await this.database.audio.search()).forEach((sound: any) => {
    //         if (!existsSync(resolve(this.config.audio.save, sound.file))) {
    //             // TODO
    //         }
    //     }, (e) => console.error(e));
    // }
}

// tslint:disable-next-line:no-unused-expression
new Core();
