import { MongoDB } from "./MongoDB";
import { Collection, ObjectID } from "mongodb";

export interface BindData {
    type: string,
    id: string | number
}

export class UserManager {
    user: Collection

    constructor(database: MongoDB) {
        this.user = database.db.collection('user');
    }

    async get(type: string, id: string | number) {
        return this.user.findOne({
            bind: {
                type: type,
                id: id
            }
        });
    }

    async create(name: string, bind: BindData) {
        if (await this.get(bind.type, bind.id)) throw new Error('User exist');

        return this.bind((await this.user.insertOne({ name: name })).ops[0]._id, bind);
    }

    async bind(id: ObjectID, bind: BindData) {
        const result = await this.user.findOneAndUpdate({ _id: id }, { $push: { bind: bind } }, { returnOriginal: false });
        if (!result) throw Error('User not found');
        return result.value;
    }

    async delete(id: ObjectID) {
        return this.user.deleteOne({ _id: id });
    }
}
