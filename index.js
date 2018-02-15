const path = require('path');
const fs = require('fs');
const os = require('os');
const Queue = require('promise-queue');
const crypto = require('crypto');

class Core {
    constructor() {
        this.config = require(path.resolve('Utils', 'Config'));
        this.urlParser = new(require(path.resolve('Utils', 'URLParser')))(this);
        this.encoder = new(require(path.resolve('Audio', 'Encoder')))(this);
        this.database = new(require(path.resolve('Database', 'MongoDB')))(this);
        this.discord = new(require(path.resolve('Component', 'Discord')))(this);
        this.telegram = new(require(path.resolve('Component', 'Telegram')))(this);

        this.queue = new Queue(os.cpus().length);

        if (!fs.existsSync(path.resolve(this.config.audio.save))) fs.mkdirSync(path.resolve(this.config.audio.save));

        // Wait DB connect
        setTimeout(this.cleanFiles.bind(this), 1000);
        setInterval(this.deDuplicate.bind(this), 600000);
    }

    /**
     * Add sound to detabase
     *
     * @param {String} sender
     * @param {String} source
     * @param {?Metadata} metadata
     * @return {Promise}
     */
    async addSound(sender, source, metadata = {}) {
        if (sender == null) throw new Error('Missing sender');
        if (source == null) throw new Error('Missing source');

        const id = (await this.database.addSound(metadata.title, metadata.artist, metadata.duration, sender, source, null)).ops[0]._id;

        try {
            const input = this.urlParser.getFile(source);
            const mediaInfo = await this.queue.add(async () => this.urlParser.getMetadata(source));

            // fetch metadata
            if (!metadata.title) metadata.title = mediaInfo.title;
            if (!metadata.artist) metadata.artist = mediaInfo.artist;
            if (!metadata.duration) metadata.duration = mediaInfo.duration;

            if (!metadata.duration) throw new Error('Invalid file');
            if (!metadata.title) throw new Error('Missing title');

            // check exist and write data
            const hash = crypto.createHash('md5').update(metadata.title + metadata.artist + metadata.duration).digest('hex');
            if (await this.checkExist(hash)) {
                throw new Error('Sound exist');
            }
            await this.database.editSound(id, metadata.title, metadata.artist, metadata.duration, hash);

            // encode
            try {
                await this.queue.add(async () => this.encoder.encode(await input, hash));
            } catch (error) {
                console.log(error.message);
                throw new Error('Encode failed');
            }

            return this.database.getSound(id);
        } catch (error) {
            this.database.delSound(id);
            console.log(error.message);
            throw error;
        }
    }

    /**
     * Check sound exist
     *
     * @param {String} hash
     * @return {Promise}
     */
    async checkExist(hash) {
        return this.database.searchSound({
            hash: hash
        }).hasNext();
    }

    async createList(name, owner) {
        // TODO
    }

    /**
     * delete sounde
     *
     * @param {String} file file ID
     */
    async delSound(file) {
        this.database.delSound(file);
    }

    /**
     * Add sound to playlist
     *
     * @param {String} uuid
     * @param {String} list
     */
    async addToList(uuid, list) {
        // TOOD
    }

    /**
     * Remove sound from playlist
     *
     * @param {String} uuid
     * @param {String} list
     */
    async removeFromList(uuid, list) {
        // TODO
    }

    /**
     * Clean up not exist in database file
     *
     */
    async cleanFiles() {
        fs.readdir(path.resolve(this.config.audio.save), async (err, files) => {
            for (const file of files) {
                const hash = file.replace('.opus', '');
                const cursor = await this.database.searchSound({
                    hash: hash
                });
                if (await cursor.count() === 0) {
                    fs.unlink(path.resolve(this.config.audio.save, file), () => {
                        console.log('Deleted not exist file: ', file);
                    });
                }
            }
        });
    }

    async checkMissFile() {
        (await this.database.searchSound()).forEach((sound) => {
            if (!fs.existsSync(path.resolve(this.config.audio.save, sound.file))) {
                // TODO
            }
        });
    }
}

new Core();
