const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
/**
 * Audio Encoder
 *
 * @class encoder
 */
class encoder {
    constructor(config) {
        this.config = config;

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
    * @param {any} input
    * @param {any} filename
    * @memberof encoder
    */
    async encode(input, filename) {
        ffmpeg(input)
            .withNoVideo()
            .audioFilters('loudnorm')
            .audioBitrate(this.config.audio.bitrate)
            .audioCodec('libopus')
            .duration(this.config.audio.length)
            .format('opus')
            .save(path.resolve(this.config.audio.save, filename))
            .on('error', (err) => {
                console.log('Cannot process file: ', err.message);
                throw err;
            })
            .on('end', () => {
                console.log('Succeedful transcoding: ', filename);
                return path.resolve(this.config.audio.save, filename);
            });
    }
}

module.exports = encoder;
