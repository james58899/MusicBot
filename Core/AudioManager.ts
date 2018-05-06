import { Collection, ObjectID, FilterQuery } from 'mongodb';
import { MongoDB } from './MongoDB';

export interface AudioData {
    _id?: ObjectID,
    title?: string,
    artist?: string,
    duration?: number,
    sender?: string,
    source?: string,
    size?:number,
    hash?: string
}

export class AudioManager {
    sound: Collection

    constructor(database: MongoDB) {
        this.sound = database.db.collection('sound');
    }

    async add(audio: AudioData) {
        return this.sound.insertOne({
            title: audio.title,
            artist: audio.artist,
            duration: audio.duration,
            sender: audio.sender,
            source: audio.source,
            hash: audio.hash
        });
    }

    async edit(id: Object, data: AudioData) {
        return this.sound.findOneAndUpdate({ _id: id }, {
            $set: {
                title: data.title,
                artist: data.artist,
                duration: data.duration,
                hash: data.hash
            }
        }, { returnOriginal: false });
    }

    async delete(id: ObjectID) {
        return this.sound.deleteOne({ _id: id });
    }

    async get(id: ObjectID) {
        return this.sound.findOne<AudioData>({ _id: id });
    }

    search(keyword?: FilterQuery<AudioData>) {
        return this.sound.find<AudioData>(keyword);
    }
}
