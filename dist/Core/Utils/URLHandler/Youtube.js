"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ytdl_core_1 = require("ytdl-core");
class Youtube {
    constructor(parser) {
        const match = /youtu\.?be/ig;
        parser.registerURLHandler(match, this.getFile);
        parser.registerMetadataProvider(match, this.getMetadata);
    }
    async getFile(link) {
        const info = await ytdl_core_1.getInfo(link);
        let selected = info.formats.filter(i => i.bitrate == null && i.audioBitrate);
        const opusFilter = info.formats.filter(i => i.audioEncoding === "opus");
        if (opusFilter.length !== 0)
            selected = opusFilter;
        if (selected.length === 0) {
            throw new Error("This video does not have any audio only format.");
        }
        selected = selected.sort((a, b) => b.audioBitrate - a.audioBitrate)[0];
        return selected.url;
    }
    async getMetadata(link) {
        const info = await ytdl_core_1.getInfo(link);
        if (info.live_playback)
            throw new Error("Bad format: is a live stream");
        return {
            artist: info.author.name,
            duration: parseInt(info.length_seconds, 10),
            title: info.title
        };
    }
}
exports.Youtube = Youtube;
//# sourceMappingURL=Youtube.js.map