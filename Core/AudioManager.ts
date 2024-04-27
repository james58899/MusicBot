import { createHash } from "crypto";
import { promises as fsp } from "fs";
import { Collection, Filter, ObjectId } from "mongodb";
import { cpus } from "os";
import { resolve } from "path";
import Queue from "promise-queue";
import { Core } from "..";
import { ListManager } from "./ListManager";
import { ERR_DB_NOT_INIT } from "./MongoDB";
import { UrlParser } from "./URLParser";
import { Encoder } from "./Utils/Encoder";
import { exists, retry } from "./Utils/PromiseUtils";

export const ERR_MISSING_TITLE = Error("Missing title");
export const ERR_NOT_AUDIO = Error("This doesn't look like audio");
export const ERR_MAX_LENGTH = Error("Audio length exceeds limit");

export interface IAudioData {
    title: string;
    artist?: string;
    duration: number;
    sender: ObjectId;
    source: string;
    hash: string;
}

export class AudioManager {
    public urlParser = new UrlParser();
    private config: any;
    private encode: Encoder["encode"];
    private database?: Collection<IAudioData>;
    private listManager!: ListManager;
    private metadataQueue = new Queue(cpus().length);
    private encodeQueue = new Queue(cpus().length);

    constructor(core: Core) {
        this.config = core.config.audio;
        const encoder = new Encoder(core.config);
        this.encode = encoder.encode.bind(encoder);

        core.on("init", () => {
            this.listManager = core.listManager;
        });

        core.on("ready", () => {
            if (!this.listManager) throw Error("ListManager hot init");
            if (!core.database.client) throw Error("Database client not init");

            this.database = core.database.client.collection("sound");
            void this.database.createIndex({ hash: 1 }, { unique: true });
        });
    }

    public async add(sender: ObjectId, source: string, metadata: { title?: string, artist?: string, duration?: number, size?: number } = {}) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        let exist = await this.search({ source }).next();
        if (exist) return exist;

        let info;
        try {
            info = await retry(() => this.metadataQueue.add(() => this.urlParser.getMetadata(source)));
        } catch (error) {
            console.error(error);
            throw ERR_NOT_AUDIO;
        }

        const title = metadata.title || info.title;
        const artist = metadata.artist || info.artist;
        const duration = metadata.duration || info.duration;
        const size = metadata.size || info.size;

        if (!duration) throw ERR_NOT_AUDIO;
        if (!title) throw ERR_MISSING_TITLE;

        if (duration > this.config.length) throw ERR_MAX_LENGTH;

        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        const hash = createHash("md5").update(title + artist + duration + size).digest("hex");

        exist = await this.search({ hash }).next();
        if (exist) return exist;

        const audio = (await this.database.findOne({
            _id: (await this.database.insertOne({
                artist,
                duration,
                hash,
                sender,
                source,
                title,
            })).insertedId
        }))!;

        try {
            await retry(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(source), audio.hash, audio.duration)));
            return audio;
        } catch (error) {
            await this.delete(audio._id);
            throw error;
        }
    }

    public edit(id: ObjectId, data: IAudioData) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOneAndUpdate({ _id: id }, {
            $set: {
                artist: data.artist,
                duration: data.duration,
                hash: data.hash,
                title: data.title,
            },
        }, { returnDocument: "after" });
    }

    public async delete(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        // check audio exist
        const audio = await this.get(id);
        if (!audio) return;

        // delete from all list
        await this.listManager.delAudioAll(id);

        // delete file
        const file = this.getCachePath(audio);
        if (await exists(file)) await fsp.unlink(file);

        return this.database.deleteOne({ _id: id });
    }

    public get(id: ObjectId) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return retry(() => this.database!.findOne({ _id: id }), 17280, 5000, false);
    }

    public search(metadata?: Filter<IAudioData>) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return metadata === undefined ? this.database.find() : this.database.find(metadata);
    }

    public async getFile(audio: IAudioData) {
        const path = this.getCachePath(audio);
        return await exists(path) ? path : false;
    }

    public async checkCache(deep = false): Promise<void> {
        if (deep) console.log("[Audio] Starting deep cache check...");

        for await (const audio of this.search()) {
            if (audio == null) return
            const file = this.getCachePath(audio);

            if (!await exists(file)) {
                if (!audio.source) {
                    void this.delete(audio._id);
                    return;
                }

                console.log(`[Audio] ${audio.title} missing in cache, redownload..`);
                retry(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(audio.source), audio.hash, audio.duration)))
                    .then(() => console.log(`[Audio] ${audio.title} downloaded`))
                    .catch(e => {
                        console.error(`Failed to download ${audio.title}`, e.message);
                        void this.delete(audio._id);
                    });
            } else if (deep) {
                const metadata = this.metadataQueue.add(() => this.urlParser.getMetadata(file));

                if (Math.abs((await metadata).duration - audio.duration) > 1) {
                    if (!audio.source) {
                        void this.delete(audio._id);
                        return;
                    }

                    console.log(`[Audio] ${audio.title} cache damaged, redownload...`);
                    retry(() => this.encodeQueue.add(async () => this.encode(await this.urlParser.getFile(audio.source), audio.hash, audio.duration)))
                        .then(() => console.log(`[Audio] ${audio.title} downloaded`))
                        .catch(e => {
                            console.error(`Failed to download ${audio.title}`, e.message);
                            void this.delete(audio._id);
                        });
                }
            }
        }
    }

    private getCachePath(audio: IAudioData) {
        return resolve(this.config.save as string, audio.hash + ".ogg");
    }
}
