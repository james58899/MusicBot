import { randomBytes } from "crypto";
import { Collection, ObjectID } from "mongodb";
import { Core } from "..";
import { ERR_DB_NOT_INIT } from "./MongoDB";

export const ERR_USER_EXIST = Error("User exist");
export const ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");

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
    private database?: Collection<IUserData>;
    private bindToken = new Map<string, ObjectID>();

    constructor(core: Core) {
        if (core.database.client) {
            this.database = core.database.client.collection("user");
            this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
        } else {
            core.database.on("connect", database => {
                this.database = database.collection("user");
                this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
            });
        }
    }

    public get(id: string | number | ObjectID, type?: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        if (type) {
            return this.database.findOne({ bind: { $elemMatch: { type, id } } });
        } else {
            return this.database.findOne({ _id: id });
        }
    }

    public async create(name: string, bind: IBindData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        if (await this.get(bind.id, bind.type)) throw ERR_USER_EXIST;

        return this.bind((await this.database.insertOne({ name, bind: [] })).ops[0]._id, bind);
    }

    public async createFromToken(token: string, bind: IBindData) {
        const id = this.bindToken.get(token);

        if (!id) throw ERR_BIND_TOKEN_NOT_FOUND;
        if (await this.get(bind.id, bind.type)) throw ERR_USER_EXIST;

        return this.bind(id, bind);
    }

    public delete(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.deleteOne({ _id: id });
    }

    public createBindToken(id: ObjectID) {
        const token = randomBytes(20).toString("hex");
        this.bindToken.set(token, id);

        // delete token after 1 hour
        setInterval(() => this.bindToken.delete(token), 60 * 60 * 1000);

        return token;
    }

    private async bind(id: ObjectID, bind: IBindData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { bind } },
            { returnOriginal: false }
        )).value!;
    }
}
