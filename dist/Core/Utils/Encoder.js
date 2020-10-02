"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Encoder = void 0;
const child_process_1 = require("child_process");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = __importStar(require("path"));
const request_1 = require("request");
const MediaInfo_1 = require("./MediaInfo");
class Encoder {
    constructor(config) {
        this.config = config.audio;
        try {
            child_process_1.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
        }
        catch (err) {
            this.ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
        }
    }
    async encode(input, filename, duration) {
        if (!this.cacheDir) {
            this.cacheDir = await fs_1.promises.mkdtemp(path_1.join(os_1.tmpdir(), "musicbot-"));
        }
        const cacheFile = path_1.join(this.cacheDir, filename);
        await this.download(input, cacheFile);
        const normalize = await this.getNormalize(cacheFile);
        const savePath = path_1.default.resolve(this.config.save, filename + ".ogg");
        return new Promise((resolve, reject) => {
            const ffmpeg = fluent_ffmpeg_1.default({ timeout: 300 });
            if (this.ffmpegPath)
                ffmpeg.setFfmpegPath(this.ffmpegPath);
            ffmpeg.input(cacheFile)
                .withNoVideo()
                .audioFilters("loudnorm=" +
                "I=-20:LRA=18:TP=-1:" +
                `measured_I=${normalize.input_i}:` +
                `measured_LRA=${normalize.input_lra}:` +
                `measured_tp=${normalize.input_tp}:` +
                `measured_thresh=${normalize.input_thresh}:` +
                `offset=${normalize.target_offset}`)
                .audioBitrate(this.config.bitrate)
                .audioCodec("libopus")
                .outputOptions("-map_metadata", "-1")
                .duration(this.config.length)
                .format("ogg")
                .save(savePath + ".tmp")
                .on("error", (err, stdout, stderr) => {
                console.error(stderr);
                return reject(err);
            })
                .on("end", async () => {
                await fs_1.promises.rename(savePath + ".tmp", savePath);
                if (Math.abs((await MediaInfo_1.getMediaInfo(savePath)).duration - duration) > 1) {
                    reject(Error("Duration mismatch"));
                }
                else {
                    resolve(savePath);
                }
                fs_1.promises.unlink(cacheFile);
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
                .audioFilters("loudnorm=print_format=json:I=-20:LRA=18:TP=-1")
                .duration(this.config.length)
                .format("null")
                .save("-")
                .on("error", (err, stdout, stderr) => {
                console.error(stderr);
                return reject(err);
            })
                .on("end", (stdout, stderr) => resolve(JSON.parse(stderr)));
        });
    }
    async download(input, output) {
        const stream = fs_1.createWriteStream(output);
        return new Promise((resolve, reject) => {
            request_1.get(input)
                .on("error", err => reject(err))
                .on("complete", () => {
                stream.close();
                resolve();
            })
                .pipe(stream);
        });
    }
}
exports.Encoder = Encoder;
