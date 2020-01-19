import { getInfo, videoFormat } from "ytdl-core";
import { IAudioMetadata, UrlParser } from "../../URLParser";

export class Youtube {
    constructor(parser: UrlParser) {
        const match = /youtu\.?be/ig;
        parser.registerURLHandler(match, this.getFile);
        parser.registerMetadataProvider(match, this.getMetadata);
    }

    public async getFile(link: string) {
        const info = await getInfo(link, {filter: "audio"});

        let selected: videoFormat[] | videoFormat = info.formats;
        const opusFilter = info.formats.filter(i => i.codecs === "opus");

        if (opusFilter.length !== 0) selected = opusFilter;

        if (selected.length === 0) {
            throw new Error("This video does not have any audio only format.");
        }

        // @ts-ignore
        selected = selected.sort((a, b) => b.audioBitrate - a.audioBitrate)[0];

        return selected.url;
    }

    public async getMetadata(link: string) {
        const info = await getInfo(link) as any;

        if (info.live_playback) throw new Error("Bad format: is a live stream");

        return {
            artist: info.author.name,
            duration: parseInt(info.length_seconds, 10),
            title: info.title
        } as IAudioMetadata;
    }
}
