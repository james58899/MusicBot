const Eris = require('eris');

class discord {
    constructor(config, core) {
        this.bot = new Eris(config.discord.token);
    }
}

module.exports = discord;
