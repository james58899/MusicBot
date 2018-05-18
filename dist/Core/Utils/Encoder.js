"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const MediaInfo_1 = require("./MediaInfo");
const PromiseUtils_1 = require("./PromiseUtils");
class Encoder {
    constructor(config) {
        this.config = config.audio;
        try {
            child_process_1.execFileSync("ffmpeg");
        }
        catch (err) {
            this.ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
        }
    }
    async encode(input, filename, duration) {
        const normalize = await this.getNormalize(input);
        const savePath = path_1.default.resolve(this.config.save, filename + ".ogg");
        return new Promise((resolve, reject) => {
            const ffmpeg = fluent_ffmpeg_1.default({ timeout: 300 });
            if (this.ffmpegPath)
                ffmpeg.setFfmpegPath(this.ffmpegPath);
            ffmpeg.input(input)
                .withNoVideo()
                .audioFilters("loudnorm=" +
                "I=-23:LRA=20:TP=-1:" +
                `measured_I=${normalize.input_i}:` +
                `measured_LRA=${normalize.input_lra}:` +
                `measured_tp=${normalize.input_tp}:` +
                `measured_thresh=${normalize.input_thresh}:` +
                `offset=${normalize.target_offset}`)
                .audioBitrate(this.config.bitrate)
                .audioCodec("libopus")
                .duration(this.config.length)
                .format("ogg")
                .save(savePath + ".tmp")
                .on("error", reject)
                .on("end", async () => {
                await PromiseUtils_1.sleep(1000);
                await fs_1.promises.rename(savePath + ".tmp", savePath);
                if ((await MediaInfo_1.getMediaInfo(savePath)).duration !== duration) {
                    reject(Error("Duration mismatch"));
                }
                else {
                    resolve(savePath);
                }
            });
        });
    }
    async getNormalize(input) {
        return new Promise((resolve, reject) => {
            const ffmpeg = fluent_ffmpeg_1.default({ stdoutLines: 14, timeout: 300 });
            if (this.ffmpegPath)
                ffmpeg.setFfmpegPath(this.ffmpegPath);
            ffmpeg.input(input)
                .withNoVideo()
                .audioFilters("loudnorm=print_format=json:I=-23:LRA=20:TP=-1")
                .duration(this.config.length)
                .format("null")
                .save("-")
                .on("error", reject)
                .on("end", (stdout, stderr) => resolve(JSON.parse(stderr)));
        });
    }
}
exports.Encoder = Encoder;
//# sourceMappingURL=Encoder.js.map