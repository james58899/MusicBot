import { randomBytes } from "crypto";
import { Collection, FindAndModifyWriteOpResultObject, ObjectID } from "mongodb";
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
    private bindToken = new Map<string, IBindData>();

    constructor(core: Core) {
        if (core.database.client) {
            this.database = core.database.client.collection("user");
        } else {
            core.database.on("connect", database => this.database = database.collection("user"));
        }
    }

    public get(type: string, id: string | number) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ bind: { $elemMatch: { type, id } } });
    }

    public async create(name: string, bind: IBindData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        if (await this.get(bind.type, bind.id)) throw ERR_USER_EXIST;

        return this.bind((await this.database.insertOne({ name })).ops[0]._id, bind);
    }

    public delete(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.deleteOne({ _id: id });
    }

    public createBindToken(bind: IBindData) {
        const token = randomBytes(20).toString("hex");
        this.bindToken.set(token, bind);

        // delete token after 1 hour
        setInterval(() => this.bindToken.delete(token), 60 * 60 * 1000);

        return token;
    }

    public useBindToken(id: ObjectID, token: string) {
        const bind = this.bindToken.get(token);
        this.bindToken.delete(token);

        if (!bind) throw ERR_BIND_TOKEN_NOT_FOUND;

        return this.bind(id, bind);
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
