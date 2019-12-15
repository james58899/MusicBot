"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const promise_queue_1 = __importDefault(require("promise-queue"));
const MongoDB_1 = require("./MongoDB");
const URLParser_1 = require("./URLParser");
const Encoder_1 = require("./Utils/Encoder");
const PromiseUtils_1 = require("./Utils/PromiseUtils");
exports.ERR_MISSING_TITLE = Error("Missing title");
exports.ERR_NOT_AUDIO = Error("This doesn't look like audio");
exports.ERR_MAX_LENGTH = Error("Audio length exceeds limit");
class AudioManager {
    constructor(core) {
        this.urlParser = new URLParser_1.UrlParser();
        this.metadataQueue = new promise_queue_1.default(os_1.cpus().length);
        this.encodeQueue = new promise_queue_1.default(os_1.cpus().length);
        this.config = core.config.audio;
        const encoder = new Encoder_1.Encoder(core.config);
        this.encode = encoder.encode.bind(encoder);
        core.on("init", core => {
            this.listManager = core.listManager;
        });
        core.on("ready", () => {
            if (!this.listManager)
                throw Error("ListManager hot init");
        });
        if (core.database.client) {
            this.database = core.database.client.collection("user");
            this.database.createIndex({ hash: 1 }, { unique: true });
        }
        else {
            core.database.on("connect", database => {
                this.database = database.collection("sound");
                this.database.createIndex({ hash: 1 }, { unique: true });
            });
        }
    }
    async add(sender, source, metadata = {}) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        let exist = await this.search({ source }).next();
        if (exist)
            return exist;
        let info;
        try {
            info = await PromiseUtils_1.retry(() => this.metadataQueue.add(() => this.urlParser.getMetadata(source)));
        }
        catch (error) {
            console.error(error);
            throw exports.ERR_NOT_AUDIO;
        }
        const title = metadata.title || info.title;
        const artist = metadata.artist || info.artist;
        const duration = metadata.duration || info.duration;
        const size = metadata.size || info.size;
        if (!duration)
            throw exports.ERR_NOT_AUDIO;
        if (!title)
            throw exports.ERR_MISSING_TITLE;
        if (duration > this.config.length)
            throw exports.ERR_MAX_LENGTH;
        const hash = crypto_1.createHash("md5").update(title + artist + duration + size).digest("hex");
        exist = await this.search({ hash }).next();
        if (exist)
            return exist;
        const audio = (await this.database.insertOne({
            artist,
            duration,
            hash,
            sender,
            source,
            title,
        })).ops[0];
        try {
            await PromiseUtils_1.retry(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(source), audio.hash, audio.duration)));
            return audio;
        }
        catch (error) {
            this.delete(audio._id);
            throw error;
        }
    }
    edit(id, data) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.findOneAndUpdate({ _id: id }, {
            $set: {
                artist: data.artist,
                duration: data.duration,
                hash: data.hash,
                title: data.title,
            },
        }, { returnOriginal: false });
    }
    async delete(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        const audio = await this.get(id);
        if (!audio)
            return;
        await this.listManager.delAudioAll(id);
        const file = this.getCachePath(audio);
        if (await PromiseUtils_1.exists(file))
            fs_1.promises.unlink(file);
        return this.database.deleteOne({ _id: id });
    }
    get(id) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return PromiseUtils_1.retry(() => this.database.findOne({ _id: id }), 17280, 5000, false);
    }
    search(metadata) {
        if (!this.database)
            throw MongoDB_1.ERR_DB_NOT_INIT;
        return this.database.find(metadata);
    }
    async getFile(audio) {
        const path = this.getCachePath(audio);
        return await PromiseUtils_1.exists(path) ? path : false;
    }
    async checkCache(deep = false) {
        if (deep)
            console.log("[Audio] Starting deep cache check...");
        return new Promise((done, reject) => {
            this.search().forEach(async (audio) => {
                const file = this.getCachePath(audio);
                if (!await PromiseUtils_1.exists(file)) {
                    if (!audio.source) {
                        this.delete(audio._id);
                        return;
                    }
                    console.log(`[Audio] ${audio.title} missing in cache, redownload..`);
                    try {
                        const source = await this.urlParser.getFile(audio.source);
                        await PromiseUtils_1.retry(() => this.encodeQueue.add(async () => this.encode(source, audio.hash, audio.duration)));
                    }
                    catch (e) {
                        console.error(`Failed to download ${audio.title}`, e.message);
                        this.delete(audio._id);
                    }
                }
                else if (deep) {
                    const metadata = this.metadataQueue.add(() => this.urlParser.getMetadata(file));
                    if (Math.abs((await metadata).duration - audio.duration) > 1) {
                        if (!audio.source) {
                            this.delete(audio._id);
                            return;
                        }
                        console.log(`[Audio] ${audio.title} cache damaged, redownload...`);
                        try {
                            const source = await this.urlParser.getFile(audio.source);
                            await PromiseUtils_1.retry(() => this.encodeQueue.add(() => this.encode(source, audio.hash, audio.duration)));
                        }
                        catch (e) {
                            console.error(`Failed to download ${audio.title}`, e.message);
                            this.delete(audio._id);
                        }
                    }
                }
            }, reject);
            done();
        });
    }
    getCachePath(audio) {
        return path_1.resolve(this.config.save, audio.hash + ".ogg");
    }
}
exports.AudioManager = AudioManager;
