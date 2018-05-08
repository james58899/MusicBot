import { createHash } from "crypto";
import { exists } from "fs";
import { Collection, ObjectID } from "mongodb";
import { cpus } from "os";
import { resolve } from "path";
import Queue from "promise-queue";
import { promisify } from "util";
import { Core } from "..";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { IAudioMetadata, UrlParser } from "./URLParser";
import { Encoder } from "./Utils/Encoder";
import { getMediaInfo } from "./Utils/MediaInfo";
import { retry } from "./Utils/Retry";
import { unlink } from "fs/promises";

export const ERR_MISSING_TITLE = Error("Missing title");

export interface IAudioData {
    _id?: ObjectID;
    title: string;
    artist?: string;
    duration: number;
    sender: ObjectID;
    source?: string;
    size: number;
    hash: string;
}

export class AudioManager {
    public urlParser = new UrlParser();
    private config: any;
    private encode: Encoder["encode"];
    private database?: Collection<IAudioData>;
    private metadataQueue = new Queue(cpus().length);
    private encodeQueue = new Queue(cpus().length);

    constructor(core: Core) {
        this.config = core.config.audio;
        const encoder = new Encoder(core.config);
        this.encode = encoder.encode.bind(encoder);

        if (core.database.client) {
            this.database = core.database.client.collection("user");
        } else {
            core.database.on("connect", database => this.database = database.collection("sound"));
        }
    }

    public async add(sender: ObjectID, source: string, metadata?: IAudioMetadata) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        const exist = await this.checkExist(source);
        if (exist) return exist;

        const info = await retry(() => this.metadataQueue.add(() => this.urlParser.getMetadata(source)));

        const title = (metadata && metadata.title) ? metadata.title : info.title;
        const artist = (metadata && metadata.artist) ? metadata.artist : info.artist;
        const duration = (metadata && metadata.duration) ? metadata.duration : info.duration;
        const size = (metadata && metadata.size) ? metadata.size : info.size;

        if (!title) throw ERR_MISSING_TITLE;

        const hash = createHash("md5").update(title + artist + duration + size).digest("hex");

        const data: IAudioData = await this.checkExist(source, hash) || (await this.database.insertOne({
            artist,
            duration,
            hash,
            sender,
            size,
            source,
            title,
        })).ops[0];

        await retry(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(source), hash)));
        return data;
    }

    public edit(id: ObjectID, data: IAudioData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOneAndUpdate({ _id: id }, {
            $set: {
                artist: data.artist,
                duration: data.duration,
                hash: data.hash,
                title: data.title,
            },
        }, { returnOriginal: false });
    }

    public async delete(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        const audio = await this.get(id);
        if (!audio) return;

        unlink(resolve(this.config.save, audio.hash + ".ogg"));
        return this.database.deleteOne({ _id: id });
    }

    public get(id: ObjectID) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ _id: id });
    }

    public search(metadata?: IAudioMetadata) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find(metadata);
    }

    public async getFile(audio: IAudioData) {
        const path = resolve(this.config.save, audio.hash + ".ogg");
        return await promisify(exists)(path) ? path : false;
    }

    public checkCache(deep: boolean = false) {
        if (deep) console.log("[Audio] Starting deep cache check...");

        return new Promise((done, reject) => {
            this.search().forEach(async audio => {
                if (!audio.source) return;

                const file = resolve(this.config.save, audio.hash + ".ogg");

                if (!await promisify(exists)(file)) {
                    console.log(`[Audio] ${audio.title} missing in cache, redownload..`);
                    await this.delete(audio._id!);
                    this.add(audio.sender, audio.source!, audio);
                } else if (deep) {
                    const metadata = this.metadataQueue.add(() => getMediaInfo(file));

                    if ((await metadata).duration !== audio.duration) {
                        console.log(`[Audio] File ${file} damaged, redownload...`);
                        await this.delete(audio._id!);
                        this.add(audio.sender, audio.source!, audio);
                    }
                }
            }, reject);

            done();
        });
    }

    private checkExist(source?: string, hash?: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ $or: [{ source }, { hash }] });
    }
}
