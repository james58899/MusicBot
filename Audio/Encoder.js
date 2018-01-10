const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

class encoder {
    constructor(config) {
        this.config = config;
    }

    async encode(input, filename) {
        ffmpeg(input)
            .withNoVideo()
            .audioFilters('loudnorm')
            .audioBitrate(this.config.audio.bitrate + 'K')
            .audioCodec('libopus')
            .duration(this.config.audio.length)
            .format('opus')
            .save(path.resolve(this.config.audio.save, filename))
            .on('start', function(commandLine) {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
            })
            .on('error', (err, stdout, stderr) => {
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
