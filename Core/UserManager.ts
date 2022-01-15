import { randomBytes } from "crypto";
import { Collection, ObjectId } from "mongodb";
import { Core } from "..";
import { ERR_DB_NOT_INIT } from "./MongoDB";

export const ERR_USER_EXIST = Error("User exist");
export const ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");

export interface IUserData {
    name: string;
    bind: IBindData[];
}

export interface IBindData {
    type: string;
    id: string | number;
}

export class UserManager {
    private database?: Collection<IUserData>;
    private bindToken = new Map<string, ObjectId>();

    constructor(core: Core) {
        core.on("ready", () => {
            if (!core.database.client) throw Error("Database client not init");

            this.database = core.database.client.collection("user");
            void this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
        });
    }

    public get(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({_id: id});
    }

    public getFromBind(type: string, id: string | number) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ bind: { $elemMatch: { type, id } } });
    }

    public async create(name: string, bind: IBindData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        if (await this.getFromBind(bind.type, bind.id)) throw ERR_USER_EXIST;

        return this.bind((await this.database.insertOne({ name, bind: [] })).insertedId, bind);
    }

    public async createFromToken(token: string, bind: IBindData) {
        const id = this.bindToken.get(token);

        if (!id) throw ERR_BIND_TOKEN_NOT_FOUND;
        if (await this.getFromBind(bind.type, bind.id)) throw ERR_USER_EXIST;

        return this.bind(id, bind);
    }

    public delete(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.deleteOne({ _id: id });
    }

    public createBindToken(id: ObjectId) {
        const token = randomBytes(20).toString("hex");
        this.bindToken.set(token, id);

        // delete token after 1 hour
        setInterval(() => this.bindToken.delete(token), 60 * 60 * 1000);

        return token;
    }

    private async bind(id: ObjectId, bind: IBindData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { _id: id },
            { $addToSet: { bind } },
            { returnDocument: "after" }
        )).value!;
    }
}
