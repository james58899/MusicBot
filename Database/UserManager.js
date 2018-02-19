class UserManager {
    constructor(database) {
        this.user = database.db.collection('user');
    }

    async get(type, id) {
        return this.user.findOne({
            bind: {
                type: type,
                id: id
            }
        });
    }

    async create(name, bind) {
        if (await this.get(bind.type, bind.id)) throw new Error('User exist');

        return this.bind((await this.user.insertOne({name: name})).ops[0]._id, bind);
    }

    async bind(id, bind) {
        const result = await this.user.findOneAndUpdate({_id: id}, {$push: {bind: bind}}, {returnOriginal: false});
        if (!result) throw Error('User not found');
        return result.value;
    }

    async delete(id) {
        return this.user.deleteOne({_id: id});
    }
}

module.exports = UserManager;
