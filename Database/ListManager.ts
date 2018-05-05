import { Collection, ObjectID } from 'mongodb';
import { MongoDB } from './MongoDB';

export class ListManager {
    list: Collection

    constructor(database: MongoDB) {
        this.list = database.db.collection('list');
    }

    async createList(name: string, owner: ObjectID) {
        // TODO
    }

    async delList(id: ObjectID) {
        // TODO
    }

    async addToList(list: ObjectID, sound: ObjectID) {
        // TODO
    }

    async delFromList(list: ObjectID, sound: ObjectID) {
        // TODO
    }

    async getPlayList(list: ObjectID) {
        // TODO
    }
}
