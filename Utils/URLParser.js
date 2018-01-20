const path = require('path');
const mediaInfo = require(path.resolve('Utils/MediaInfo'));

class urlParser {
    constructor(core) {
        this.urlHandler = new Map();
        this.metadataProvider = new Map();
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
    }

    async getMetadata(url) {
        for (const [match, provider] of this.metadataProvider) {
            if (url.match(new RegExp(match, 'ig'))) {
                return provider(url);
            }
        }

        return mediaInfo(url);
    }
}

module.exports = urlParser;
