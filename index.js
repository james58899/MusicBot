const path = require('path');
const config = require(path.resolve("Utils/Config"));
const database = require(path.resolve("Database/SQLite"));
const URLParser = require(path.resolve("Utils/URLParser"));
const encoder = new (require(path.resolve("Audio/Encoder"))) (config);
const discord = new (require(path.resolve("Component/Discord"))) (config);
const telegram = new (require(path.resolve("Component/Telegram"))) (config);

const core = class {
    add(file, duration, title, artist) {
        //TODO
    }
}