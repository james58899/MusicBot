import { rename } from "fs/promises";
import path from "path";

const ffmpeg = require("fluent-ffmpeg");

export class Encoder {
    private config: any;

    constructor(config: any) {
        this.config = config.audio;

        // Test system ffmpeg
        try {
            require("child_process").spawn("ffmpeg");
        } catch (err) {
            ffmpeg.ffmpegPath(require("@ffmpeg-installer/ffmpeg").path);
        }
    }

    public async encode(input: string, filename: string): Promise<string> {
        const normalize = await this.getNormalize(input);

        const savePath = path.resolve(this.config.save, filename + ".ogg");
        return new Promise<string>((resolve, reject) => {
            ffmpeg(input)
                .withNoVideo()
                .audioFilters(
                    "loudnorm=" +
                    `measured_I=${normalize.input_i}:` +
                    `measured_LRA=${normalize.input_lra}:` +
                    `measured_tp=${normalize.input_tp}:` +
                    `measured_thresh=${normalize.input_thresh}:` +
                    `offset=${normalize.target_offset}`
                )
                .audioBitrate(this.config.bitrate)
                .audioCodec("libopus")
                .duration(this.config.length)
                .format("ogg")
                .save(savePath + ".tmp")
                .on("error", reject)
                .on("end", () => rename(savePath + ".tmp", savePath).then(() => resolve(savePath)));
        });
    }

    private async getNormalize(input: string) {
        return new Promise<any>((resolve, reject) => {
            ffmpeg(input, { stdoutLines: 14 })
                .withNoVideo()
                .audioFilters("loudnorm=print_format=json")
                .duration(this.config.length)
                .format("null")
                .save("-")
                .on("error", reject)
                .on("end", (stdout: string, stderr: string) => resolve(JSON.parse(stderr)));
        });
    }
}
