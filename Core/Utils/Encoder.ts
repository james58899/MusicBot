import path from 'path'
import { Core } from '../..';

const ffmpeg = require('fluent-ffmpeg')

/**
 * Audio Encoder
 *
 * @class encoder
 */
export class Encoder {
    config: any

    constructor(core: Core) {
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
     * @return {Promise<String>} Transcoded file path
     * @memberof encoder
     */
    async encode(input: string, filename: string): Promise<string> {
        const normalize = await this.getNormalize(input);

        filename = filename + '.opus';
        return new Promise<string>((resolve, reject) => {
            ffmpeg(input)
                .withNoVideo()
                .audioFilters(
                    'loudnorm=' +
                    `measured_I=${normalize.input_i}:` +
                    `measured_LRA=${normalize.input_lra}:` +
                    `measured_tp=${normalize.input_tp}:` +
                    `measured_thresh=${normalize.input_thresh}:` +
                    `offset=${normalize.target_offset}`
                )
                .audioBitrate(this.config.audio.bitrate)
                .audioCodec('libopus')
                .duration(this.config.audio.length)
                .format('opus')
                .save(path.resolve(this.config.audio.save, filename))
                .on('error', reject)
                .on('end', () => resolve(filename));
        });
    }

    private async getNormalize(input: string) {
        return new Promise<any>((resolve, reject) => {
            ffmpeg(input, { stdoutLines: 14 })
                .withNoVideo()
                .audioFilters('loudnorm=print_format=json')
                .duration(this.config.audio.length)
                .format('null')
                .save('-')
                .on('error', reject)
                .on('end', (stdout: string, stderr: string) => resolve(JSON.parse(stderr)));
        });
    }
}
