import { Collection, ObjectID } from "mongodb";
import { Core } from "..";

export class ListManager {
    private database?: Collection;

    constructor(core: Core) {
        if (core.database.client) {
            this.database = core.database.client.collection("list");
        } else {
            core.database.on("connect", client => this.database = client.collection("list"));
        }
    }

    public async createList(name: string, owner: ObjectID) {
        // TODO
    }

    public async delList(id: ObjectID) {
        // TODO
    }

    public async addToList(list: ObjectID, sound: ObjectID) {
        // TODO
    }

    public async delFromList(list: ObjectID, sound: ObjectID) {
        // TODO
    }

    public async getPlayList(list: ObjectID) {
        // TODO
    }
}
