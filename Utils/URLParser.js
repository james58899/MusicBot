const path = require('path');
const fs = require('fs');
const mediaInfo = require(path.resolve('Utils/MediaInfo'));

class UrlParser {
    constructor(core) {
        this.urlHandler = new Map();
        this.metadataProvider = new Map();

        fs.readdir(path.resolve(__dirname, 'URLHandler'), (err, files) => {
            for (const file of files) {
                new (require(path.resolve(__dirname, 'URLHandler', file)))(this);
            }
        });
    }

    registerURLHandler(match, handler) {
        this.urlHandler.set(match, handler);
    }

    registerMetadataProvider(match, provider) {
        this.metadataProvider.set(match, provider);
    }

    async getFile(url) {
        for (const [match, handler] of this.urlHandler) {
            if (url.match(new RegExp(match, 'ig'))) {
                return handler(url);
            }
        }

        return url;
    }

    async getMetadata(url) {
        for (const [match, provider] of this.metadataProvider) {
            if (url.match(new RegExp(match, 'ig'))) {
                return provider(url);
            }
        }

        return mediaInfo.getInfo(url);
    }
}

module.exports = UrlParser;
