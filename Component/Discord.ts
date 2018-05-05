import { Client } from 'eris'
import { Core } from '..';

export class Discord {
    config:any
    bot: any

    constructor(core: Core) {
        this.config = core.config

        if (!this.config.discord.token) return;
        this.bot = new Client(this.config.discord.token as string);
    }
}
