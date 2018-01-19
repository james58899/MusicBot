const Eris = require('eris');

class discord {
    constructor(core) {
        this.config = core.config;

        this.bot = new Eris(this.config.discord.token);
    }
}

module.exports = discord;
