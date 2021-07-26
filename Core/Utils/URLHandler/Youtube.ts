import { filterFormats, getBasicInfo, getInfo, videoFormat } from "ytdl-core";
import { IAudioMetadata, UrlParser } from "../../URLParser";

export class Youtube {
    constructor(parser: UrlParser) {
        const match = /youtu\.?be/ig;
        parser.registerURLHandler(match, Youtube.getFile);
        parser.registerMetadataProvider(match, Youtube.getMetadata);
    }

    public static async getFile(link: string) {
        const info = await getInfo(link);

        let selected: videoFormat[] | videoFormat = filterFormats(info.formats, "audio");
        const opusFilter = info.formats.filter(i => i.codecs === "opus");

        if (opusFilter.length !== 0) selected = opusFilter;

        if (selected.length === 0) {
            throw new Error("This video does not have any audio only format.");
        }

        selected = selected.sort((a, b) => b.audioBitrate! - a.audioBitrate!)[0];

        return selected.url;
    }

    public static async getMetadata(link: string) {
        const info = await getBasicInfo(link);

        if (info.videoDetails.isLiveContent) throw new Error("Bad format: is a live stream");

        return {
            artist: info.videoDetails.author.name,
            duration: parseInt(info.videoDetails.lengthSeconds, 10),
            title: info.videoDetails.title
        } as IAudioMetadata;
    }
}
