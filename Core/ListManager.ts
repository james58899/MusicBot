import { Collection, ObjectId } from "mongodb";
import { Core } from "..";
import { AudioManager } from "./AudioManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { retry } from "./Utils/PromiseUtils";

export interface IAudioList {
    name: string;
    owner: ObjectId;
    admin: ObjectId[];
    audio: ObjectId[];
}

export class ListManager {
    private database?: Collection<IAudioList>;
    private audioManager!: AudioManager;

    constructor(core: Core) {
        core.on("init", () => {
            this.audioManager = core.audioManager;
        });

        core.on("ready", () => {
            if (!this.audioManager) throw Error("AudioManager not init");
            if (!core.database.client) throw Error("Database client not init");

            this.database = core.database.client.collection("list");

            // Add field admin to old lists
            void this.database.updateMany({ admin: { $exists: false } }, { $set: { admin: [] } });

            // Create indexes
            void this.database.createIndex({ owner: 1 });
            void this.database.createIndex({ admin: 1 });
        });
    }

    public async create(name: string, owner: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        await this.database.insertOne({
            admin: Array<ObjectId>(),
            audio: Array<ObjectId>(),
            name,
            owner
        });
    }

    public get(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return retry(() => this.database!.findOne({ _id: id }), 17280, 5000, false);
    }

    public getAll() {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find();
    }

    public getFromPermission(user: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find({ $or: [{ owner: user }, { admin: user }] });
    }

    public async rename(id: ObjectId, name: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $set: { name } },
            { returnDocument: "after" }
        )).value;
    }

    public async delete(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        await this.database.deleteOne({ _id: id });
    }

    public async addAdmin(id: ObjectId, admin: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { admin } },
            { returnDocument: "after" }
        )).value;
    }

    public async removeAdmin(id: ObjectId, admin: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $pull: { admin } },
            { returnDocument: "after" }
        )).value;
    }

    public async addAudio(id: ObjectId, audio: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { audio } },
            { returnDocument: "after" }
        )).value;
    }

    public async delAudio(id: ObjectId, audio: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $pull: { audio } },
            { returnDocument: "after" }
        )).value;
    }

    public async delAudioAll(audio: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.updateMany({}, { $pull: { audio } });
    }

    public async checkAudioExist() {
        await this.getAll().forEach(list => {
            list.audio.forEach(async audio => {
                if (!await this.audioManager.get(audio)) void this.delAudioAll(audio);
            });
        });
    }

    public async audioInList(audio: ObjectId) {
        return this.searchListFromAudio(audio).hasNext();
    }

    private searchListFromAudio(audio: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find({ audio });
    }
}
