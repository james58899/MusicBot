import { execFile, execFileSync } from "child_process";
import { IAudioMetadata } from "../URLParser";

let ffprobe: string;
// Test system ffprobe
try {
    execFileSync("ffprobe");
    ffprobe = "ffprobe";
} catch (err) {
    ffprobe = require("@ffprobe-installer/ffprobe").path;
}

export async function getMediaInfo(file: string) {
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

    return new Promise<IAudioMetadata>((resolve, reject) => {
        execFile(ffprobe, ffprobeOption, execOption, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }

            // Match output
            const durationMatch = stdout.match(/duration=(.*)/i);
            const sizeMatch = stdout.match(/size=(.*)/i);
            const titleMatch = stdout.match(/TAG:title=(.*)/i);
            const artistMatch = stdout.match(/TAG:artist=(.*)/i);

            // Test has match
            const title = (titleMatch) ? titleMatch[1] : undefined;
            const artist = (artistMatch) ? artistMatch[1] : undefined;
            const duration = (durationMatch && durationMatch[1] !== "N/A") ? parseInt(durationMatch[1], 10) : undefined;
            const size = (sizeMatch && sizeMatch[1] !== "N/A") ? sizeMatch[1] : undefined;

            resolve({
                artist,
                duration,
                size,
                title
            } as IAudioMetadata);
        });
    });
}
