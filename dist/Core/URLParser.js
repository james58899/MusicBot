"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlParser = void 0;
const MediaInfo_1 = require("./Utils/MediaInfo");
const Youtube_1 = require("./Utils/URLHandler/Youtube");
class UrlParser {
    constructor() {
        this.urlHandler = new Map();
        this.metadataProvider = new Map();
        new Youtube_1.Youtube(this);
    }
    registerURLHandler(match, handler) {
        this.urlHandler.set(match, handler);
    }
    registerMetadataProvider(match, provider) {
        this.metadataProvider.set(match, provider);
    }
    async getFile(url) {
        for (const [match, handler] of this.urlHandler) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, "gi");
            regexp.lastIndex = 0;
            if (regexp.test(url)) {
                return handler(url);
            }
        }
        return url;
    }
    async getMetadata(url) {
        for (const [match, provider] of this.metadataProvider) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, "gi");
            regexp.lastIndex = 0;
            if (regexp.test(url)) {
                return provider(url);
            }
        }
        return (0, MediaInfo_1.getMediaInfo)(url);
    }
}
exports.UrlParser = UrlParser;
