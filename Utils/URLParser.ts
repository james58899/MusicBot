import { Core } from "..";
import { readdir } from "fs/promises";
import { resolve } from "path";
import { getMediaInfo } from "./MediaInfo";
import { AudioData } from "../Database/AudioManager";

type URLHandlerType = (url: string) => string | Promise<string>
type metadataProviderType = (url: string) => AudioData | Promise<AudioData>

export class UrlParser {
    urlHandler = new Map<RegExp | string, URLHandlerType>();
    metadataProvider = new Map<RegExp | string, metadataProviderType>();

    constructor(core: Core) {
        readdir(resolve(__dirname, 'URLHandler')).then(files => {
            for (const file of files) {
                new (require(resolve(__dirname, 'URLHandler', file)))(this);
            }
        });
    }

    registerURLHandler(match: RegExp | string, handler: URLHandlerType) {
        this.urlHandler.set(match, handler);
    }

    registerMetadataProvider(match: RegExp | string, provider: metadataProviderType) {
        this.metadataProvider.set(match, provider);
    }

    async getFile(url: string) {
        for (const [match, handler] of this.urlHandler) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, 'gi');
            if (url.match(regexp)) {
                return handler(url);
            }
        }

        return url;
    }

    async getMetadata(url: string) {
        for (const [match, provider] of this.metadataProvider) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, 'gi');
            if (url.match(regexp)) {
                return provider(url);
            }
        }

        return getMediaInfo(url);
    }
}
