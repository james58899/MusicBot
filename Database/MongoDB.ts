import { Core } from "../index"
import { EventEmitter } from "events";
import { MongoClient, Db } from "mongodb";
import { AudioManager } from "./AudioManager";
import { UserManager } from "./UserManager";
import { ListManager } from "./ListManager";

export class MongoDB extends EventEmitter {
    config: any
    db!: Db;
    audio!: AudioManager
    user!: UserManager
    list!: ListManager

    constructor(core: Core) {
        super()

        this.config = core.config.database;

        MongoClient.connect(this.config.host)
            .then(client => {
                console.log('[MongoDB] Connected successfully to server');

                this.db = client.db(this.config.name)

                this.audio = new AudioManager(this);
                this.user = new UserManager(this);
                this.list = new ListManager(this);

                this.emit('connect', this);
            })
    }
}
