"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MongoDB_1 = require("./MongoDB");
class ListManager {
    constructor(core) {
        if (core.database.client) {
            this.database = core.database.client.collection("list");
            this.database.createIndex({ owner: 1 });
        }
        else {
            core.database.on("connect", client => {
                this.database = client.collection("list");
                this.database.createIndex({ owner: 1 });
            });
        }
    }
    async create(name, owner) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.insertOne({
            audio: Array(),
            name,
            owner,
        })).ops[0];
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOne({ _id: id });
    }
    getAll() {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find();
    }
    getFromOwner(owner) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find({ owner });
    }
    async rename(id, name) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $set: { name } }, { returnOriginal: false })).value;
    }
    async delete(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        this.database.deleteOne({ _id: id });
    }
    async addAudio(id, audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $addToSet: { audio } }, { returnOriginal: false })).value;
    }
    async delAudio(id, audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $pull: { audio } }, { returnOriginal: false })).value;
    }
    async delAudioAll(audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.updateMany({}, { $pull: { audio } });
    }
}
exports.ListManager = ListManager;
//# sourceMappingURL=ListManager.js.map