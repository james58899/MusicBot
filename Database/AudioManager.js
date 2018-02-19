class AudioManager {
    constructor(database) {
        this.sound = database.db.collection('sound');
    }

    async add(title, artist, duration, sender, source, hash) {
        return this.sound.insertOne({
            title: title,
            artist: artist,
            duration: duration,
            sender: sender,
            source: source,
            hash: hash
        });
    }

    async edit(id, title, artist, duration, hash) {
        return this.sound.findOneAndUpdate({_id: id}, {$set: {
            title: title,
            artist: artist,
            duration: duration,
            hash: hash
        }}, {returnOriginal: false});
    }

    async delete(id) {
        return this.sound.deleteOne({_id: id});
    }

    async get(id) {
        return this.sound.findOne({_id: id});
    }

    search(keyword) {
        return this.sound.find(keyword);
    }
}

module.exports = AudioManager;
