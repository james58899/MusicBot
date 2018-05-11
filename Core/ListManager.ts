import { Collection, ObjectID } from "mongodb";
import { Core } from "..";
import { ERR_DB_NOT_INIT } from "./MongoDB";

export interface IAudioList {
    _id: ObjectID;
    name: string;
    owner: ObjectID;
    audio: ObjectID[];
}

export class ListManager {
    private database?: Collection<IAudioList>;

    constructor(core: Core) {
        if (core.database.client) {
            this.database = core.database.client.collection("list");
        } else {
            core.database.on("connect", client => this.database = client.collection("list"));
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
            { $pull: audio },
            { returnOriginal: false }
        )).value;
    }
}
