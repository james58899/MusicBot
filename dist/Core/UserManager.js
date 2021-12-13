"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserManager = exports.ERR_BIND_TOKEN_NOT_FOUND = exports.ERR_USER_EXIST = void 0;
const crypto_1 = require("crypto");
const MongoDB_1 = require("./MongoDB");
exports.ERR_USER_EXIST = Error("User exist");
exports.ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");
class UserManager {
    constructor(core) {
        this.bindToken = new Map();
        core.on("ready", () => {
            if (!core.database.client)
                throw Error("Database client not init");
            this.database = core.database.client.collection("user");
            void this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
        });
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOne({ _id: id });
    }
    getFromBind(type, id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOne({ bind: { $elemMatch: { type, id } } });
    }
    async create(name, bind) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        if (await this.getFromBind(bind.type, bind.id))
            throw exports.ERR_USER_EXIST;
        return this.bind((await this.database.insertOne({ name, bind: [] })).insertedId, bind);
    }
    async createFromToken(token, bind) {
        const id = this.bindToken.get(token);
        if (!id)
            throw exports.ERR_BIND_TOKEN_NOT_FOUND;
        if (await this.getFromBind(bind.type, bind.id))
            throw exports.ERR_USER_EXIST;
        return this.bind(id, bind);
    }
    delete(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.deleteOne({ _id: id });
    }
    createBindToken(id) {
        const token = (0, crypto_1.randomBytes)(20).toString("hex");
        this.bindToken.set(token, id);
        setInterval(() => this.bindToken.delete(token), 60 * 60 * 1000);
        return token;
    }
    async bind(id, bind) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $addToSet: { bind } }, { returnDocument: "after" })).value;
    }
}
exports.UserManager = UserManager;
