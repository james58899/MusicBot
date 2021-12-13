"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListManager = void 0;
const MongoDB_1 = require("./MongoDB");
const PromiseUtils_1 = require("./Utils/PromiseUtils");
class ListManager {
    constructor(core) {
        core.on("init", () => {
            this.audioManager = core.audioManager;
        });
        core.on("ready", () => {
            if (!this.audioManager)
                throw Error("AudioManager not init");
            if (!core.database.client)
                throw Error("Database client not init");
            this.database = core.database.client.collection("list");
            void this.database.updateMany({ admin: { $exists: false } }, { $set: { admin: [] } });
            void this.database.createIndex({ owner: 1 });
            void this.database.createIndex({ admin: 1 });
        });
    }
    async create(name, owner) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        await this.database.insertOne({
            admin: Array(),
            audio: Array(),
            name,
            owner
        });
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (0, PromiseUtils_1.retry)(() => this.database.findOne({ _id: id }), 17280, 5000, false);
    }
    getAll() {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find();
    }
    getFromPermission(user) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find({ $or: [{ owner: user }, { admin: user }] });
    }
    async rename(id, name) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $set: { name } }, { returnDocument: "after" })).value;
    }
    async delete(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        await this.database.deleteOne({ _id: id });
    }
    async addAdmin(id, admin) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $addToSet: { admin } }, { returnDocument: "after" })).value;
    }
    async removeAdmin(id, admin) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $pull: { admin } }, { returnDocument: "after" })).value;
    }
    async addAudio(id, audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $addToSet: { audio } }, { returnDocument: "after" })).value;
    }
    async delAudio(id, audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return (await this.database.findOneAndUpdate({ _id: id }, { $pull: { audio } }, { returnDocument: "after" })).value;
    }
    async delAudioAll(audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.updateMany({}, { $pull: { audio } });
    }
    async checkAudioExist() {
        await this.getAll().forEach(list => {
            list.audio.forEach(async (audio) => {
                if (!await this.audioManager.get(audio))
                    void this.delAudioAll(audio);
            });
        });
    }
    async audioInList(audio) {
        return this.searchListFromAudio(audio).hasNext();
    }
    searchListFromAudio(audio) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find({ audio });
    }
}
exports.ListManager = ListManager;
