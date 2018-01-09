const path = require('path');
const config = require(path.resolve("Utils/Config"));
const database = require(path.resolve("Database/SQLite"));
const encoder = new (require(path.resolve("Audio/Encoder"))) (config);
const discord = new (require(path.resolve("Component/Discord"))) (config);
const telegram = new (require(path.resolve("Component/Telegram"))) (config);