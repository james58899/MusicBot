const execFile = require('child_process').execFile;

/**
 * Audio metadata helper
 *
 * @class mediaInfo
 */
class mediaInfo {
    /**
     * Creates an instance of mediaInfo
     * @param {String} file File path or url
     * @memberof mediaInfo
     */
    constructor(file) {
        let ffprobe;
        // Test system ffprobe
        try {
            execFile('ffprobe');
            ffprobe = 'ffprobe';
        } catch (err) {
            ffprobe = require('@ffprobe-installer/ffprobe').path;
        }

        const ffprobeOption = [
            '-v', 'error',
            '-of', 'default=nw=1',
            '-show_entries', 'stream_tags=title,artist:format_tags=title,artist:format=duration',
            file
        ];

        const execOption = {
            timeout: 10000,
            windowsHide: true
        };

        execFile(ffprobe, ffprobeOption, execOption, (err, stdout, stderr) => {
            if (err) throw err;
            this.duration = stdout.match(/duration=(.*)/i)[1];
            this.title = stdout.match(/TAG:title=(.*)/i)[1];
            this.artist = stdout.match(/TAG:artist=(.*)/i)[1];
        });
    }

    /**
     * Get duration
     *
     * @return {Number|String}
     * @memberof mediaInfo
     */
    getDuration() {
        return this.duration;
    }

    /**
     * Get Title
     *
     * @return {String|undefined}
     * @memberof mediaInfo
     */
    getTitle() {
        return this.title;
    }

    /**
     * Get Artist
     *
     * @return {String|undefined}
     * @memberof mediaInfo
     */
    getArtist() {
        return this.artist;
    }
}


module.exports = mediaInfo;
