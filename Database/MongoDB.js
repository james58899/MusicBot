const path = require('path');
const EventEmitter = require('events');
const MongoClient = require('mongodb').MongoClient;

class MongoDB extends EventEmitter {
    constructor(core) {
        super();

        this.config = core.config.database;

        MongoClient.connect(this.config.host, function(err, client) {
            console.log('[MongoDB] Connected successfully to server');

            this.db = client.db(this.config.name);

            this.audio = new(require(path.resolve(__dirname, 'AudioManager')))(this);
            this.user = new(require(path.resolve(__dirname, 'UserManager')))(this);
            this.list = new(require(path.resolve(__dirname, 'ListManager')))(this);

            this.emit('connect', this);
        }.bind(this));
    }
}

module.exports = MongoDB;
