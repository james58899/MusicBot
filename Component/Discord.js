const Eris = require('eris');

class Discord {
    constructor(core) {
        this.config = core.config;

        this.bot = new Eris(this.config.discord.token);
    }
}

module.exports = Discord;
