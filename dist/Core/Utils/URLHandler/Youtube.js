"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Youtube = void 0;
const ytdl_core_1 = require("ytdl-core");
class Youtube {
    constructor(parser) {
        const match = /youtu\.?be/ig;
        parser.registerURLHandler(match, Youtube.getFile);
        parser.registerMetadataProvider(match, Youtube.getMetadata);
    }
    static async getFile(link) {
        const info = await ytdl_core_1.getInfo(link);
        let selected = ytdl_core_1.filterFormats(info.formats, "audio");
        const opusFilter = info.formats.filter(i => i.codecs === "opus");
        if (opusFilter.length !== 0)
            selected = opusFilter;
        if (selected.length === 0) {
            throw new Error("This video does not have any audio only format.");
        }
        selected = selected.sort((a, b) => b.audioBitrate - a.audioBitrate)[0];
        return selected.url;
    }
    static async getMetadata(link) {
        const info = await ytdl_core_1.getBasicInfo(link);
        if (info.videoDetails.isLiveContent)
            throw new Error("Bad format: is a live stream");
        return {
            artist: info.videoDetails.author.name,
            duration: parseInt(info.videoDetails.lengthSeconds, 10),
            title: info.videoDetails.title
        };
    }
}
exports.Youtube = Youtube;
