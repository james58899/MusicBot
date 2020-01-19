"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const MongoDB_1 = require("./MongoDB");
exports.ERR_USER_EXIST = Error("User exist");
exports.ERR_BIND_TOKEN_NOT_FOUND = Error("Bind token not found");
class UserManager {
    constructor(core) {
        this.bindToken = new Map();
        if (core.database.client) {
            this.database = core.database.client.collection("user");
            this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
        }
        else {
            core.database.on("connect", database => {
                this.database = database.collection("user");
                this.database.createIndex({ "bind.type": 1, "bind.id": 1 }, { unique: true });
            });
        }
    }
    get(type, id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOne({ bind: { $elemMatch: { type, id } } });
    }
    async create(name, bind) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        if (await this.get(bind.type, bind.id))
            throw exports.ERR_USER_EXIST;
        return this.bind((await this.database.insertOne({ name, bind: [] })).ops[0]._id, bind);
    }
    async createFromToken(token, bind) {
        const id = this.bindToken.get(token);
        if (!id)
            throw exports.ERR_BIND_TOKEN_NOT_FOUND;
        if (await this.get(bind.type, bind.id))
            throw exports.ERR_USER_EXIST;
        return this.bind(id, bind);
    }
    delete(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.deleteOne({ _id: id });
    }
    createBindToken(id) {
        const token = crypto_1.randomBytes(20).toString("hex");
        this.bindToken.set(token, id);
        setInterval(() => this.bindToken.delete(token), 60 * 60 * 1000);
        return token;
    }
    async bind(id, bind) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $addToSet: { bind } }, { returnOriginal: false })).value;
    }
}
exports.UserManager = UserManager;
