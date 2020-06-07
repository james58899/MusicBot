"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaInfo = void 0;
const child_process_1 = require("child_process");
let ffprobe;
try {
    child_process_1.execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    ffprobe = "ffprobe";
}
catch (err) {
    ffprobe = require("@ffprobe-installer/ffprobe").path;
}
async function getMediaInfo(file) {
    const ffprobeOption = [
        "-v", "error",
        "-of", "default=nw=1",
        "-show_entries", "stream_tags=title,artist:format_tags=title,artist:format=duration,size",
        file,
    ];
    const execOption = {
        timeout: 30000,
        windowsHide: true
    };
    return new Promise((resolve, reject) => {
        child_process_1.execFile(ffprobe, ffprobeOption, execOption, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }
            const durationMatch = stdout.match(/duration=(.*)/i);
            const sizeMatch = stdout.match(/size=(.*)/i);
            const titleMatch = stdout.match(/TAG:title=(.*)/i);
            const artistMatch = stdout.match(/TAG:artist=(.*)/i);
            const title = (titleMatch) ? titleMatch[1] : undefined;
            const artist = (artistMatch) ? artistMatch[1] : undefined;
            const duration = (durationMatch && durationMatch[1] !== "N/A") ? Math.round(Number(durationMatch[1])) : undefined;
            const size = (sizeMatch && sizeMatch[1] !== "N/A") ? sizeMatch[1] : undefined;
            resolve({
                artist,
                duration,
                size,
                title
            });
        });
    });
}
exports.getMediaInfo = getMediaInfo;
