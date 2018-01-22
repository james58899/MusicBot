const Sequelize = require('sequelize');
const Op = Sequelize.Op;

class SQLite {
    constructor(core) {
        this.config = core.config;

        this.sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: 'database.sqlite3',
            operatorsAliases: false,
            logging: false
        });

        // sound table
        this.sound = this.sequelize.define('sound', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            title: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            artist: Sequelize.TEXT,
            duration: {
                type: Sequelize.NUMERIC,
                allowNull: false
            },
            sender: {
                type: Sequelize.TEXT,
                allowNull: false
            },
            source: {
                type: Sequelize.TEXT,
                allowNull: false,
                unique: true
            },
            file: {
                type: Sequelize.TEXT,
                unique: true
            }
        }, {
            updatedAt: false
        });

        // list table
        this.list = this.sequelize.define('list', {
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
        }, {
            updatedAt: false
        });

        // playlist table
        this.playList = this.sequelize.define('playlist', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            }
        }, {
            timestamps: false
        });

        this.playList.belongsTo(this.list);
        this.sound.hasMany(this.playList);

        this.sound.sync();
        this.list.sync();
        this.playList.sync();
    }

    /**
     * Add sounde to database
     *
     * @param {String} title
     * @param {String} artist
     * @param {Number} duration
     * @param {String} sender
     * @param {String} source
     * @param {String} file
     * @return {Promise}
     * @memberof sqlite
     */
    async addSound(title, artist, duration, sender, source, file) {
        return this.sound.build({
            title: title,
            artist: artist,
            duration: duration,
            sender: sender,
            source: source,
            file: file
        }).save();
    }

    async delSound(id) {
        const sound = await this.sound.findById(id);
        return sound.destroy();
    }

    async getSound(id) {
        return this.sound.findById(id);
    }

    /**
     * Search sound
     *
     * @param {String|Object} keyword keyword or metadata object
     * @return {Promise}
     * @memberof sqlite
     */
    async searchSound(keyword) {
        if (typeof keyword === 'object' ) {
            return this.sound.findAndCountAll({
                where: keyword
            });
        } else if (typeof keyword === 'string') {
            return this.sound.findAndCountAll({
                where: {
                    [Op.or]: [
                        {title: keyword},
                        {artist: keyword},
                        {sender: keyword}
                    ]
                }
            });
        } else {
            throw new Error('Wrong keyword');
        }
    }

    /**
     * Clean invaild data
     *
     * @memberof sqlite
     */
    async cleanInvalid() {
        const sound = await this.sound.findAll({where: {file: null}});

        for (const i of sound) {
            i.destroy();
        }
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
        }).save();
    }

    async delFromList(list, sound) {
        // TODO
    }

    async getPlayList(list) {
        // TODO
    }
}

module.exports = SQLite;
