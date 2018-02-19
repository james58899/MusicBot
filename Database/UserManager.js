class UserManager {
    constructor(core) {
        this.database = core.database;
    }

    async getUser(type, id) {
        return this.database.getUser(type, id);
    }

    async createUser(name, bind) {
        if (await this.getUser(bind.type, bind.id)) throw new Error('User exist');

        return this.bindUser((await this.database.createUser(name)).ops[0]._id, bind);
    }

    async bindUser(id, bind) {
        const result = await this.database.bindUser(id, bind);
        if (!result) throw Error('User not found');
        return result.value;
    }

    async delUser(id) {
        return this.database.delUser(id);
    }
}

module.exports = UserManager;
