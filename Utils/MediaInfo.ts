import { AudioData } from "../Database/AudioManager";
import { execFile } from "child_process";

let ffprobe: string;
// Test system ffprobe
try {
    execFile('ffprobe');
    ffprobe = 'ffprobe';
} catch (err) {
    ffprobe = require('@ffprobe-installer/ffprobe').path;
}

export async function getMediaInfo(file: string) {
    const ffprobeOption = [
        '-v', 'error',
        '-of', 'default=nw=1',
        '-show_entries', 'stream_tags=title,artist:format_tags=title,artist:format=duration,size',
        file
    ];

    const execOption = {
        timeout: 10000,
        windowsHide: true
    };

    return new Promise<AudioData>((resolve) => {
        execFile(ffprobe, ffprobeOption, execOption, (err, stdout, stderr) => {
            if (err) {
                console.log(err);
                resolve({});
            }

            // Match output
            const durationMatch = stdout.match(/duration=(.*)/i);
            const sizeMatch = stdout.match(/size=(.*)/i);
            const titleMatch = stdout.match(/TAG:title=(.*)/i);
            const artistMatch = stdout.match(/TAG:artist=(.*)/i);

            // Test has match
            const title = (titleMatch) ? titleMatch[1] : undefined;
            const artist = (artistMatch) ? artistMatch[1] : undefined;
            const duration = (durationMatch && durationMatch[1] !== 'N/A') ? durationMatch[1] : undefined;
            const size = (sizeMatch && sizeMatch[1] !== 'N/A') ? sizeMatch[1] : undefined;

            resolve({
                title: title,
                artist: artist,
                duration: duration,
                size: size
            } as AudioData);
        });
    });
}
