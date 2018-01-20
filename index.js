const path = require('path');

const Core = class {
    constructor() {
        this.config = require(path.resolve('Utils/Config'));
        this.urlParser = new (require(path.resolve('Utils/URLParser')))(this);
        this.encoder = new (require(path.resolve('Audio/Encoder')))(this);
        this.database = new (require(path.resolve('Database/SQLite')))(this);
        this.discord = new (require(path.resolve('Component/Discord')))(this);
        this.telegram = new (require(path.resolve('Component/Telegram')))(this);
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
        if (await this.checkExist(source)) throw new Error('Sound already exists');

        const mediainfo = await this.urlParser.getMetadata(source);
        const input = this.urlParser.getFile(source);

        if (metadata.title) mediainfo.title = metadata.title;
        if (metadata.artist) mediainfo.artist = metadata.artist;
        if (metadata.duration) mediainfo.duration = metadata.duration;

        const sound = await this.database.addSound(mediainfo.title, mediainfo.artist, mediainfo.duration, sender, source);

        try {
            const file = this.encoder.encode(await input, sound.id);
            sound.file = await file;
        } catch (error) {
            sound.destroy();
            throw error;
        }

        return sound.save();
    }

    /**
     * Check sound exist
     *
     * @param {any} source
     * @return {Boolean}
     */
    async checkExist(source) {
        return (await this.database.searchSound({source: source})).count !== 0;
    }

    /**
     * delete sounde
     *
     * @param {String} file file ID
     */
    async delSound(file) {
        // TODO
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
};

new Core();
