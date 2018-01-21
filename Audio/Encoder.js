const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
/**
 * Audio Encoder
 *
 * @class encoder
 */
class encoder {
    /**
     * Creates an instance of encoder.
     * @param {Object} core
     * @memberof encoder
     */
    constructor(core) {
        this.config = core.config;

        // Test system ffmpeg
        try {
            require('child_process').spawn('ffmpeg');
        } catch (err) {
            ffmpeg.ffmpegPath(require('@ffmpeg-installer/ffmpeg').path);
        }
    }

    /**
     * input file then transcodeing
     *
     * @param {String} input
     * @param {String} filename
     * @return {String} Transcoded file path
     * @memberof encoder
     */
    async encode(input, filename) {
        filename = filename + '.opus';
        return new Promise((resolve, reject) => {
            ffmpeg(input)
                .withNoVideo()
                .audioFilters('loudnorm')
                .audioBitrate(this.config.audio.bitrate)
                .audioCodec('libopus')
                .duration(this.config.audio.length)
                .format('opus')
                .save(path.resolve(this.config.audio.save, filename))
                .on('error', reject)
                .on('end', () => {
                    resolve(filename);
                });
        });
    }
}

module.exports = encoder;
