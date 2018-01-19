const Sequelize = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite3'
});

class sqlite {
    constructor(config) {
        this.config = config;

        // sounds table
        this.sound = sequelize.define('sound', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            sender: {
                type: Sequelize.TEXT,
                allowNull: false
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
            playList: Sequelize.INTEGER,
            sound: Sequelize.INTEGER
        });

        this.sound.sync();
        this.list.sync();
        this.playList.sync();
    }

    /**
     * Add sounde to database
     *
     * @param {String} sender
     * @param {String} file
     * @param {String} title
     * @param {?String} [artist=null]
     * @param {Number} duration
     * @return {Object}
     * @memberof sqlite
     */
    async addSound(sender, file, title, artist, duration) {
        const sound = await this.sound.build({
            sender: sender,
            file: file,
            title: title,
            artist: artist,
            duration: duration
        }).save();
        return sound;
    }

    async delSound(fileId) {
        // TODO
    }

    async getSound(fileId) {
        // TODO
    }

    async searchSound(keyword) {
        // TODO
    }

    async createList(name, owner) {
        // TODO
    }

    async delList(listId) {
        // TODO
    }
}

module.exports = sqlite;
