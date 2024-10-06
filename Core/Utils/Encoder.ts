import { execFileSync } from "child_process";
import FFmpeg from "fluent-ffmpeg";
import { createWriteStream, existsSync, promises as fsp } from "fs";
import { tmpdir } from "os";
import path, { join } from "path";
import { get } from "request";
import { getMediaInfo } from "./MediaInfo";

export class Encoder {
    private config: any;
    private ffmpegPath?: string;
    private cacheDir: string | undefined;

    constructor(config: any) {
        this.config = config.audio;

        // Test system ffmpeg
        try {
            execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            this.ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
        }
    }

    public async encode(input: string, filename: string, duration: number): Promise<string> {
        if (!this.cacheDir || !existsSync(this.cacheDir)) {
            this.cacheDir = await fsp.mkdtemp(join(tmpdir(), "musicbot-"));
        }

        const cacheFile = join(this.cacheDir, filename);
        await this.download(input, cacheFile);

        const normalize = await this.getNormalize(cacheFile);
        const savePath = path.resolve(this.config.save as string, filename + ".ogg");

        return new Promise<string>((resolve, reject) => {
            const ffmpeg = FFmpeg({ timeout: 300 });
            if (this.ffmpegPath) ffmpeg.setFfmpegPath(this.ffmpegPath);

            ffmpeg.input(cacheFile)
                .withNoVideo()
                .audioFilters(
                    "loudnorm=" +
                    "I=-20:LRA=18:TP=-1:" +
                    `measured_I=${normalize.input_i}:` +
                    `measured_LRA=${normalize.input_lra}:` +
                    `measured_tp=${normalize.input_tp}:` +
                    `measured_thresh=${normalize.input_thresh}:` +
                    `offset=${normalize.target_offset}`
                )
                .audioBitrate(this.config.bitrate as number)
                .audioCodec("libopus")
                .outputOptions("-map_metadata", "-1")
                .duration(this.config.length as number)
                .format("ogg")
                .save(savePath + ".tmp")
                .on("error", (err, stdout, stderr) => {
                    console.error(stderr);
                    return reject(err);
                })
                .on("end", async () => {
                    await fsp.rename(savePath + ".tmp", savePath);
                    if (Math.abs((await getMediaInfo(savePath)).duration - duration) > 1) {
                        reject(Error("Duration mismatch"));
                    } else {
                        resolve(savePath);
                    }
                    await fsp.unlink(cacheFile);
                });
        });
    }

    private async getNormalize(input: string) {
        return new Promise<any>((resolve, reject) => {
            const ffmpeg = FFmpeg({ stdoutLines: 14, timeout: 300 });
            if (this.ffmpegPath) ffmpeg.setFfmpegPath(this.ffmpegPath);

            ffmpeg.input(input)
                .withNoVideo()
                .audioFilters("loudnorm=print_format=json:I=-20:LRA=18:TP=-1")
                .duration(this.config.length as number)
                .format("null")
                .save("-")
                .on("error", (err, stdout, stderr) => {
                    console.error(stderr);
                    return reject(err);
                })
                .on("end", (stdout, stderr) => resolve(JSON.parse(stderr!)));
        });
    }

    private async download(input: string, output: string): Promise<void> {
        const stream = createWriteStream(output);

        return new Promise((resolve, reject) => {
            get(input)
            .on("error", err => reject(err))
            .on("complete", () => {
                stream.close();
                resolve();
            })
            .pipe(stream);
        });
    }
}
