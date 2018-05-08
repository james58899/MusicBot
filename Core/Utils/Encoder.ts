import { rename } from "fs/promises";
import path from "path";
import { getMediaInfo } from "./MediaInfo";

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

    public async encode(input: string, filename: string, duration: number): Promise<string> {
        const normalize = await this.getNormalize(input);

        const savePath = path.resolve(this.config.save, filename + ".ogg");
        return new Promise<string>((resolve, reject) => {
            ffmpeg(input, { timeout: 300 })
                .withNoVideo()
                .audioFilters(
                    "loudnorm=" +
                    "I=-23:LRA=10:TP=-1:" +
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
                .on("end", async () => {
                    await rename(savePath + ".tmp", savePath);
                    if ((await getMediaInfo(savePath)).duration !== duration) {
                        reject(Error("Duration mismatch"));
                    } else {
                        resolve(savePath);
                    }
                });
        });
    }

    private async getNormalize(input: string) {
        return new Promise<any>((resolve, reject) => {
            ffmpeg(input, { stdoutLines: 14, timeout: 300 })
                .withNoVideo()
                .audioFilters("loudnorm=print_format=json:I=-23:LRA=10:TP=-1")
                .duration(this.config.length)
                .format("null")
                .save("-")
                .on("error", reject)
                .on("end", (stdout: string, stderr: string) => resolve(JSON.parse(stderr)));
        });
    }
}
