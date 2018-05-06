import { Collection, ObjectID, FindAndModifyWriteOpResultObject } from "mongodb";
import { Core } from "..";

export interface IUserData {
    _id: ObjectID;
    name: string;
    bind: IBindData[];
}

export interface IBindData {
    type: string;
    id: string | number;
}

export class UserManager {
    private database?: Collection;

    constructor(core: Core) {
        if (core.database.client) {
            this.database = core.database.client.collection("user");
        } else {
            core.database.on("connect", database => this.database = database.collection<IUserData>("user"));
        }
    }

    public async get(type: string, id: string | number) {
        if (!this.database) throw Error("Database is not initialized");

        return this.database.findOne<IUserData>({ bind: { type, id } });
    }

    public async create(name: string, bind: IBindData) {
        if (!this.database) throw Error("Database is not initialized");

        if (await this.get(bind.type, bind.id)) throw new Error("User exist")

        return this.bind((await this.database.insertOne({ name })).ops[0]._id, bind);
    }

    public async bind(id: ObjectID, bind: IBindData) {
        if (!this.database) throw Error("Database is not initialized");

        const result: FindAndModifyWriteOpResultObject<IUserData> = await this.database.findOneAndUpdate(
            { _id: id },
            { $push: { bind } },
            { returnOriginal: false }
        );

        if (!result) throw Error("User not found");

        return result.value!!;
    }

    public async delete(id: ObjectID) {
        if (!this.database) throw Error("Database is not initialized");

        return this.database.deleteOne({ _id: id });
    }
}
