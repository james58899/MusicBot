const execFile = require('child_process').execFile;
let ffprobe;
// Test system ffprobe
try {
    execFile('ffprobe');
    ffprobe = 'ffprobe';
} catch (err) {
    ffprobe = require('@ffprobe-installer/ffprobe').path;
}

async function mediaInfo(file) {
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

    return new Promise((resolve) => {
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
            const title = (titleMatch) ? titleMatch[1] : null;
            const artist = (artistMatch) ? artistMatch[1] : null;
            const duration = (durationMatch && durationMatch !== 'N/A') ? durationMatch[1] : null;
            const size = (sizeMatch && sizeMatch !== 'N/A') ? sizeMatch[1] : null;

            resolve({
                title: title,
                artist: artist,
                duration: duration,
                size: size
            });
        });
    });
}


module.exports = mediaInfo;
