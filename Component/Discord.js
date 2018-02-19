const Eris = require('eris');

class Discord {
    constructor(core) {
        this.config = core.config;

        if (!this.config.discord.token) return;
        this.bot = new Eris(this.config.discord.token);
    }
}

module.exports = Discord;
