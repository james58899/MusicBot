import { Collection, ObjectID } from "mongodb";
import { Core } from "..";
import { AudioManager } from "./AudioManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";

export interface IAudioList {
    _id: ObjectID;
    name: string;
    owner: ObjectID;
    audio: ObjectID[];
}

export class ListManager {
    private database?: Collection<IAudioList>;
    private audioManager?: AudioManager;

    constructor(core: Core) {
        this.audioManager = core.audioManager;

        if (core.database.client) {
            this.database = core.database.client.collection("list");
            this.database.createIndex({ owner: 1 });
        } else {
            core.database.on("connect", client => {
                this.database = client.collection("list");
                this.database.createIndex({ owner: 1 });
            });
        }
    }

    public async create(name: string, owner: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.insertOne({
            audio: Array<ObjectID>(),
            name,
            owner,
        } as IAudioList)).ops[0] as IAudioList;
    }

    public get(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ _id: id });
    }

    public getAll() {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find();
    }

    public getFromOwner(owner: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find({ owner });
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
                if (!await this.audioManager!!.get(audio)) this.delAudioAll(audio);
            });
        });
    }
}
