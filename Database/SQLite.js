const Sequelize = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite3'
});

class sqlite {
    constructor(core) {
        this.config = core.config;

        // sound table
        this.sound = sequelize.define('sound', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            file: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            title: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            artist: Sequelize.TEXT,
            duration: {
                type: Sequelize.NUMERIC,
                allowNull: false
            }
        });

        // source table
        this.source = sequelize.define('source', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            sender: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            source: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            sound: {
                type: Sequelize.INTEGER,
                allowNull: false
            }
        });

        // list table
        this.list = sequelize.define('list', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            owner: {
                type: Sequelize.TEXT,
                allowNull: false
            }
        });

        // playlist table
        this.playList = sequelize.define('playlist', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            playlist: Sequelize.INTEGER,
            sound: Sequelize.INTEGER
        });

        this.sound.sync();
        this.list.sync();
        this.playList.sync();
    }

    /**
     * Add sounde to database
     *
     * @param {String} file
     * @param {String} title
     * @param {?String} [artist=null]
     * @param {Number} duration
     * @return {Promise}
     * @memberof sqlite
     */
    async addSound(file, title, artist, duration) {
        return this.sound.build({
            file: file,
            title: title,
            artist: artist,
            duration: duration
        }).save();
    }

    async delSound(id) {
        // TODO
    }

    async getSound(id) {
        // TODO
    }

    /**
     * Set sound source
     *
     * @param {String} sender
     * @param {String} source
     * @param {Number} sound
     * @return {Promise}
     * @memberof sqlite
     */
    async addSource(sender, source, sound) {
        return this.source.build({
            sender: sender,
            source: source,
            sound: sound
        });
    }

    async searchSound(keyword) {
        // TODO
    }

    async createList(name, owner) {
        // TODO
    }

    async delList(id) {
        // TODO
    }

    /**
     * Add sound to playlist
     *
     * @param {Number} list ID for List
     * @param {Number} sound ID for sound
     * @return {Promise}
     * @memberof sqlite
     */
    async addToList(list, sound) {
        return this.source.build({
            list: list,
            sound: sound
        });
    }

    async delFromList(list, sound) {
        // TODO
    }

    async getPlayList(list) {
        // TODO
    }
}

module.exports = sqlite;
