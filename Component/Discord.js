const Eris = require('eris');

class discord {
    constructor(config) {
        this.bot = new Eris(config.discord.token);
    }
}

module.exports = discord