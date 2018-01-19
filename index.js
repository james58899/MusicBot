const path = require('path');
const uuid = require('uuid/v1');

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
     * @param {String} input
     * @param {?Object} metadata
     * @return {Promise}
     */
    async addSound(sender, source, input, metadata = {}) {
        const file = this.encoder.encode(input, uuid());
        const mediainfo = await this.urlParser.getMetadata(source);

        if (metadata.title) mediainfo.title = metadata.title;
        if (metadata.artist) mediainfo.artist = metadata.artist;
        if (metadata.duration) mediainfo.duration = metadata.duration;

        const sound = await this.database.addSound(await file, mediainfo.title, mediainfo.artist, mediainfo.duration);
        this.database.addSource(sender, source, sound.id);
        return sound;
    }

    async addSourdFromSource(sender, source) {
        const link = await this.urlParser.getFile(source);
        const metadata = await this.urlParser.getMetadata(source);
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
