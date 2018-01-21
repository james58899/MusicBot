const path = require('path');
const fs = require('fs');

const Core = class {
    constructor() {
        this.config = require(path.resolve('Utils/Config'));
        this.urlParser = new (require(path.resolve('Utils/URLParser')))(this);
        this.encoder = new (require(path.resolve('Audio/Encoder')))(this);
        this.database = new (require(path.resolve('Database/SQLite')))(this);
        this.discord = new (require(path.resolve('Component/Discord')))(this);
        this.telegram = new (require(path.resolve('Component/Telegram')))(this);

        if (!fs.existsSync(path.resolve(this.config.audio.save))) fs.mkdirSync(path.resolve(this.config.audio.save));

        this.database.cleanInvalid();
        this.cleanFiles();
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

        const checkExist = await this.checkExist(source);
        if (checkExist) return checkExist;

        try {
            const input = this.urlParser.getFile(source);
            const mediaInfo = await this.urlParser.getMetadata(source);

            if (!metadata.title) metadata.title = mediaInfo.title;
            if (!metadata.artist) metadata.artist = mediaInfo.artist;
            if (!metadata.duration) metadata.duration = mediaInfo.duration;

            if (metadata.title == null) throw new Error('Missing title');

            const sound = await this.database.addSound(metadata.title, metadata.artist, metadata.duration, sender, source);

            try {
                const file = await this.encoder.encode(await input, sound.id);
                sound.file = file;
            } catch (error) {
                sound.destroy();
                console.log(error.message);
                throw new Error('Encode failed');
            }

            return sound.save();
        } catch (error) {
            throw error;
        }
    }

    /**
     * Check sound exist
     *
     * @param {String} source
     * @return {Object}
     */
    async checkExist(source) {
        return (await this.database.searchSound({source: source})).rows[0];
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
        fs.readdir(path.resolve(this.config.audio.save), (err, files) => {
            for (const file of files) {
                this.database.searchSound({file: file}).then((result) => {
                    if (result.count === 0) {
                        fs.unlink(path.resolve(this.config.audio.save, file), () => {
                            console.log('Deleted not exist file: ', file);
                        });
                    }
                });
            }
        });
    }
};

new Core();
