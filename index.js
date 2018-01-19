const path = require('path');
const uuid = require('uuid/v1');
const MediaInfo = require(path.resolve('Utils/MediaInfo'));

const Core = class {
    constructor() {
        this.config = require(path.resolve('Utils/Config'));
        this.encoder = new (require(path.resolve('Audio/Encoder')))(this.config);
        this.database = new (require(path.resolve('Database/SQLite')))(this.config);
        this.discord = new (require(path.resolve('Component/Discord')))(this.config, this);
        this.telegram = new (require(path.resolve('Component/Telegram')))(this.config, this);
    }

    /**
     * Add sound to detabase
     *
     * @param {String} sender
     * @param {String} input
     * @param {?String} title
     * @param {?String} artist
     * @param {?Number} duration
     * @return {Object}
     */
    async addSound(sender, input, title, artist, duration) {
        // I think get media info will faster then encode...
        const mediainfo = new MediaInfo(input);
        const file = await this.encoder.encode(input, `${sender}_${uuid()}.opus`);

        if (!title) title = mediainfo.getTitle();
        if (!artist) artist = mediainfo.getArtist();
        if (!duration) duration = mediainfo.getDuration();

        return this.database.addSound(sender, file, title, artist, duration);
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
