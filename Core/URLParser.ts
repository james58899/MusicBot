import { getMediaInfo } from "./Utils/MediaInfo";
import { Youtube } from "./Utils/URLHandler/Youtube";

export interface IAudioMetadata {
    title?: string;
    artist?: string;
    duration?: number;
    size?: number;
}

type URLHandlerType = (url: string) => string | Promise<string>;
type metadataProviderType = (url: string) => IAudioMetadata | Promise<IAudioMetadata>;

export class UrlParser {
    private urlHandler = new Map<RegExp | string, URLHandlerType>();
    private metadataProvider = new Map<RegExp | string, metadataProviderType>();

    constructor() {
        // tslint:disable-next-line:no-unused-expression
        new Youtube(this);
    }

    public registerURLHandler(match: RegExp | string, handler: URLHandlerType) {
        this.urlHandler.set(match, handler);
    }

    public registerMetadataProvider(match: RegExp | string, provider: metadataProviderType) {
        this.metadataProvider.set(match, provider);
    }

    public async getFile(url: string) {
        for (const [match, handler] of this.urlHandler) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, "gi");
            if (url.match(regexp)) {
                return handler(url);
            }
        }

        return url;
    }

    public async getMetadata(url: string) {
        for (const [match, provider] of this.metadataProvider) {
            const regexp = (match instanceof RegExp) ? match : new RegExp(match, "gi");
            if (url.match(regexp)) {
                return provider(url);
            }
        }

        return getMediaInfo(url);
    }
}
