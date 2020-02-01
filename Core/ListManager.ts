import { Collection, ObjectID } from "mongodb";
import { Core } from "..";
import { AudioManager } from "./AudioManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { retry } from "./Utils/PromiseUtils";

export interface IAudioList {
    _id: ObjectID;
    name: string;
    owner: ObjectID;
    admin: ObjectID[];
    audio: ObjectID[];
}

export class ListManager {
    private database?: Collection<IAudioList>;
    private audioManager!: AudioManager;

    constructor(core: Core) {
        core.on("init", _ => {
            this.audioManager = core.audioManager;
        });

        core.on("ready", () => {
            if (!this.audioManager) throw Error("AudioManager not init");
            if (!core.database.client) throw Error("Database client not init");

            this.database = core.database.client.collection("list");

            // Add field admin to old lists
            this.database.findOneAndUpdate({ admin: { $exists: false } }, { $set: { admin: [] } });

            // Create indexes
            this.database.createIndex({ owner: 1 });
            this.database.createIndex({ admin: 1 });
        });
    }

    public async create(name: string, owner: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.insertOne({
            admin: Array<ObjectID>(),
            audio: Array<ObjectID>(),
            name,
            owner
        } as IAudioList)).ops[0] as IAudioList;
    }

    public get(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return retry(() => this.database!!.findOne({ _id: id }), 17280, 5000, false);
    }

    public getAll() {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find();
    }

    public getFromPermission(user: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find({ $or: [{ owner: user }, { admin: user }] });
    }

    public async rename(id: ObjectID, name: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $set: { name } },
            { returnOriginal: false }
        )).value;
    }

    public async delete(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        this.database.deleteOne({ _id: id });
    }

    public async addAdmin(id: ObjectID, admin: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { admin } },
            { returnOriginal: false }
        )).value;
    }

    public async removeAdmin(id: ObjectID, admin: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $pull: { admin } },
            { returnOriginal: false }
        )).value;
    }

    public async addAudio(id: ObjectID, audio: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { audio } },
            { returnOriginal: false }
        )).value;
    }

    public async delAudio(id: ObjectID, audio: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $pull: { audio } },
            { returnOriginal: false }
        )).value;
    }

    public async delAudioAll(audio: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.updateMany({}, { $pull: { audio } });
    }

    public async checkAudioExist() {
        this.getAll().forEach(list => {
            list.audio.forEach(async audio => {
                if (!await this.audioManager.get(audio)) this.delAudioAll(audio);
            });
        });
    }
}
