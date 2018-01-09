const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

class encoder {
    constructor(config) {
        this.config = config;
    }

    encoder(input, filename) {
        ffmpeg(input)
            .withNoVideo()
            .audioFilters('loudnorm')
            .audioBitrate(config.audio.bitrate + 'K')
            .audioCodec('libopus')
            .duration(config.audio.length)
            .save(path.resolve(config.audio.save, filename))
    }
}

module.exports = encoder;