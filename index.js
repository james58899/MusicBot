const path = require('path');
const config = require(path.resolve('Utils/Config'));
const database = require(path.resolve('Database/SQLite'));
const URLParser = require(path.resolve('Utils/URLParser'));

const Core = class {
    constructor() {
        this.encoder = new (require(path.resolve('Audio/Encoder')))(config);
        this.discord = new (require(path.resolve('Component/Discord')))(config, this);
        this.telegram = new (require(path.resolve('Component/Telegram')))(config, this);
    }

    /**
    * Add sound to detabase
    *
    * @param {string} file
    * @param {number} duration
    * @param {string} title
    * @param {string|undefined} artist
    */
    async add(file, duration, title, artist) {
        const encodedFile = await this.encoder.encode(file, 'test');
    }


    /**
    * Check sound exist in database.
    *
    * @param {string} file
    */
    async checkExist(file) {
        // TODO
    }
    /**
    * Add sound to playlist
    *
    * @param {string} uuid
    * @param {string} list
    */
    async addToList(uuid, list) {
        // TOOD
    }

    /**
    * Remove sound from playlist
    *
    * @param {string} uuid
    * @param {string} list
    */
    async removeFromList(uuid, list) {
        // TODO
    }
};

new Core();
