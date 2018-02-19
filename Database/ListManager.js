class ListManager {
    constructor(database) {
        this.list = database.db.collection('list');
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

module.exports = ListManager;
