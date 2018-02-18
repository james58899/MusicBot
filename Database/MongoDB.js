const MongoClient = require('mongodb').MongoClient;

class MongoDB {
    constructor(core) {
        this.config = core.config.database;

        MongoClient.connect(this.config.host, function(err, client) {
            console.log('[MongoDB] Connected successfully to server');

            this.db = client.db(this.config.name);
            this.sound = this.db.collection('sound');
            this.user = this.db.collection('user');
            this.list = this.db.collection('list');
        }.bind(this));
    }

    async addSound(title, artist, duration, sender, source, hash) {
        return this.sound.insertOne({
            title: title,
            artist: artist,
            duration: duration,
            sender: sender,
            source: source,
            hash: hash
        });
    }

    async editSound(id, title, artist, duration, hash) {
        return this.sound.findOneAndUpdate({_id: id}, {$set: {
            title: title,
            artist: artist,
            duration: duration,
            hash: hash
        }});
    }

    async delSound(id) {
        return this.sound.deleteOne({_id: id});
    }

    async getSound(id) {
        return this.sound.findOne({_id: id});
    }

    searchSound(keyword) {
        return this.sound.find(keyword);
    }

    /**
     * Clean invaild data
     *
     * @memberof sqlite
     */
    async cleanInvalid() {
        // TODO
    }

    async createList(name, owner) {
        // TODO
    }

    async delList(id) {
        // TODO
    }

    async addToList(list, sound) {
        // TODO
    }

    async delFromList(list, sound) {
        // TODO
    }

    async getPlayList(list) {
        // TODO
    }
}

module.exports = MongoDB;
