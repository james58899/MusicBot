import Queue from 'promise-queue';
import { cpus } from 'os';
import { mkdirSync, existsSync, unlink } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import { readdir } from 'fs/promises';
import { MongoDB } from './Core/MongoDB'
import { Telegram } from './Component/Telegram';
import { Discord } from './Component/Discord';
import { Encoder } from './Core/Utils/Encoder';
import { AudioData } from './Core/AudioManager';
import { ObjectID } from 'bson';
import { UrlParser } from './Core/URLParser';

export class Core {
    readonly config = require(resolve('config.json'));

    urlParser = new UrlParser(this)
    database = new MongoDB(this);
    private encoder = new Encoder(this)
    private queue = new Queue(cpus().length)

    constructor() {
        if (!existsSync(resolve(this.config.audio.save))) mkdirSync(resolve(this.config.audio.save));

        // Wait DB connect
        this.database.on('connect', () => {
            this.cleanFiles()
            new Telegram(this)
            new Discord(this)
        });
    }

    async addSound(data: AudioData) {
        if (!data.source) throw Error("Missing source")
        if (!data.sender) throw Error("Missing sender")

        const database = this.database.audio;
        const id = (await database.add(data)).ops[0]._id;

        try {
            const input = this.urlParser.getFile(data.source);
            const mediaInfo = await this.queue.add(async () => this.urlParser.getMetadata(data.source!!));

            // fetch metadata
            if (!data.title) data.title = mediaInfo.title;
            if (!data.artist) data.artist = mediaInfo.artist;
            if (!data.duration) data.duration = mediaInfo.duration;

            if (!data.duration) throw new Error('Invalid file');
            if (!data.title) throw new Error('Missing title');

            // check exist and write data
            data.hash = createHash('md5').update(data.title + data.artist + data.duration + mediaInfo.size).digest('hex');
            if (await this.checkExist(data.hash)) {
                throw new Error('Sound exist');
            }
            await database.edit(id, data);

            // encode
            try {
                await this.queue.add(async () => this.encoder.encode(await input, data.hash!!));
            } catch (error) {
                console.error(error);
                throw new Error('Encode failed');
            }

            return database.get(id);
        } catch (error) {
            database.delete(id);
            console.log(`[Core] Add sound fail, sender: ${data.sender} error: ${error.message}`);
            throw error;
        }
    }

    private async checkExist(hash: string) {
        return this.database.audio.search({ hash: hash }).hasNext();
    }

    async createList(name: String, owner: Number) {
        // TODO
    }

    async delSound(file: ObjectID) {
        this.database.audio.delete(file);
    }

    async addToList(uuid: string, list: string) {
        // TOOD
    }

    async removeFromList(uuid: string, list: string) {
        // TODO
    }

    private async cleanFiles() {
        readdir(resolve(this.config.audio.save)).then(async files => {
            for (const file of files) {
                const hash = file.replace('.opus', '');
                const cursor = await this.database.audio.search({ hash: hash });
                if (await cursor.count() === 0) {
                    unlink(resolve(this.config.audio.save, file), () => {
                        console.log('[Core] Deleted not exist file: ', file);
                    });
                }
            }
        });
    }

    // private async checkMissFile() {
    //     (await this.database.audio.search()).forEach((sound: any) => {
    //         if (!existsSync(resolve(this.config.audio.save, sound.file))) {
    //             // TODO
    //         }
    //     }, (e) => console.error(e));
    // }
}

new Core();
