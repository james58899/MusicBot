"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Web = exports.BIND_TYPE = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const fs_1 = require("fs");
const mongodb_1 = require("mongodb");
const multer_1 = __importDefault(require("multer"));
const AudioManager_1 = require("../Core/AudioManager");
exports.BIND_TYPE = "telegram";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
const ERR_BAD_REQUEST = "Maybe wrong paramters!";
const ERR_FORBIDDEN = "You're not allowed to do this!";
const ERR_NOT_REGISTER = "Please use /register to register or bind account via Telegram!";
const ERR_NOT_FOUND = "File disappeared!";
class Web {
    constructor(core) {
        if (!core.config.telegram.token)
            throw ERR_MISSING_TOKEN;
        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;
        this.digest = crypto_1.default.createHash("sha256").update(core.config.telegram.token).digest();
        this.upload = core.config.web.upload;
        this.webConfig = {
            tgBotName: core.config.telegram.botname,
            title: core.config.web.title,
        };
        this.server = express_1.default();
        this.middlewares();
        this.registerRoutes();
        this.errorHandler();
        this.server.listen(8081);
    }
    async middlewares() {
        this.server.use(express_1.default.json());
    }
    async errorHandler() {
        this.server.use((err, req, res, next) => {
            if (err.message.startsWith("HTTP400")) {
                res.status(400).json({
                    error: ERR_BAD_REQUEST
                });
            }
            else if (err.message.startsWith("HTTP401")) {
                res.status(401).json({
                    error: ERR_NOT_REGISTER
                });
            }
            else if (err.message.startsWith("HTTP403")) {
                res.status(403).json({
                    error: ERR_FORBIDDEN
                });
            }
            else if (err.message.startsWith("HTTP404")) {
                res.status(404).json({
                    error: ERR_NOT_FOUND
                });
            }
            else {
                next(err);
            }
        });
    }
    route(fn) {
        return (req, res, next) => {
            const promise = fn.bind(this)(req, res, next);
            if (promise instanceof Promise) {
                promise.catch(next);
            }
        };
    }
    async registerRoutes() {
        const upload = multer_1.default({ dest: this.upload });
        this.server.get("/", (req, res) => res.send("MusicBot Web Server"));
        this.server.get("/config", this.route(this.getConfig));
        this.server.get("/login", this.route(this.getLogin));
        this.server.get("/lists", this.route(this.getLists));
        this.server.post("/lists", this.route(this.postLists));
        this.server.get("/list/:lid", this.route(this.getList));
        this.server.patch("/list/:lid", this.route(this.patchList));
        this.server.delete("/list/:lid", this.route(this.deleteList));
        this.server.get("/list/:lid/audios", this.route(this.getListAudios));
        this.server.post("/list/:lid/audios", upload.array("audio"), this.route(this.postListAudios));
        this.server.delete("/list/:lid/audio/:aid", this.route(this.deleteListAudio));
        this.server.get("/audio/:aid", this.route(this.getAudio));
        this.server.get("/audio/:aid/file", this.route(this.getAudioFile));
    }
    async getConfig(req, res) {
        res.json(this.webConfig);
    }
    async getLogin(req, res) {
        const user = await this.checkUser(req);
        res.json({
            msg: "OK",
            user
        });
    }
    async getLists(req, res) {
        const user = await this.getUser(req);
        const lists = await this.list.getAll().map((list) => {
            return {
                id: list._id,
                name: list.name,
                own: !!user && user._id.equals(list.owner)
            };
        }).toArray();
        const own = [];
        const other = [];
        lists.forEach(list => {
            if (list.own) {
                own.push(list);
            }
            else {
                other.push(list);
            }
        });
        res.json({
            lists: [...own, ...other],
            msg: "OK"
        });
    }
    async postLists(req, res) {
        const user = await this.checkUser(req);
        const name = req.body.name;
        if (!name) {
            throw Error("HTTP400");
        }
        const list = await this.list.create(name, user._id);
        res.json({
            list,
            msg: "OK"
        });
    }
    async getList(req, res) {
        const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
        res.json({
            list,
            msg: "OK"
        });
    }
    async patchList(req, res) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
        const name = req.body.name;
        if (!name) {
            throw Error("HTTP400");
        }
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.rename(list._id, name);
        res.json({
            msg: "OK",
            result
        });
    }
    async deleteList(req, res) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.delete(list._id);
        res.json({
            msg: "OK",
            result
        });
    }
    async getListAudios(req, res) {
        const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        const audios = await this.audio.search({
            _id: {
                $in: list.audio.map(id => new mongodb_1.ObjectID(id))
            }
        }).toArray();
        res.json({
            audios,
            msg: "OK"
        });
    }
    async postListAudios(req, res) {
        try {
            const user = await this.checkUser(req);
            const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
            if (!list) {
                throw Error("HTTP404");
            }
            if (!user._id.equals(list.owner)) {
                throw Error("HTTP403");
            }
            const audios = [];
            const paths = [];
            if (req.files) {
                req.files.forEach((file) => {
                    paths.push(file.path);
                });
            }
            if (req.body) {
                const body = req.body;
                if (body.uris) {
                    if (typeof body.uris === "string") {
                        paths.push(...JSON.parse(body.uris));
                    }
                    else {
                        paths.push(...body.uris);
                    }
                }
            }
            await Promise.all(paths.map(async (path) => {
                const audio = await this.processFile(path, user);
                if (audio) {
                    await this.list.addAudio(list._id, audio._id);
                    audios.push(audio);
                }
                else {
                }
            }));
            res.json({
                audios,
                msg: "OK"
            });
        }
        finally {
            if (req.files) {
                await Promise.all(req.files.map(async (file) => await fs_1.promises.unlink(file.path)));
            }
        }
    }
    async deleteListAudio(req, res) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new mongodb_1.ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.delAudio(list._id, new mongodb_1.ObjectID(req.params.aid));
        res.json({
            msg: "OK",
            result
        });
    }
    async getAudio(req, res) {
        const audio = await this.audio.get(new mongodb_1.ObjectID(req.params.aid));
        res.json({
            audio,
            msg: "OK"
        });
    }
    async getAudioFile(req, res) {
        const audio = await this.audio.get(new mongodb_1.ObjectID(req.params.aid));
        if (!audio) {
            throw Error("HTTP404");
        }
        const file = await this.audio.getFile(audio);
        if (!file) {
            throw Error("HTTP404");
        }
        res.download(file);
    }
    async getUser(req) {
        const tgStr = req.get("X-Auth");
        if (!tgStr)
            return null;
        const tg = JSON.parse(tgStr);
        const hash = tg.hash;
        delete tg.hash;
        const payload = Object.keys(tg).sort().map(key => {
            return `${key}=${tg[key]}`;
        }).join("\n");
        const hmac = crypto_1.default.createHmac("sha256", this.digest);
        hmac.update(payload);
        if (hmac.digest("hex") !== hash) {
            return null;
        }
        return this.user.getFromBind(exports.BIND_TYPE, tg.id);
    }
    async checkUser(req) {
        const user = await this.getUser(req);
        if (!user) {
            throw Error("HTTP401");
        }
        return user;
    }
    async processFile(file, sender) {
        if (!file)
            return null;
        let audio;
        try {
            audio = await this.audio.add(sender._id, file);
        }
        catch (error) {
            if (error === AudioManager_1.ERR_MISSING_TITLE) {
                return null;
            }
            else if (error === AudioManager_1.ERR_NOT_AUDIO) {
                return null;
            }
            else {
                return null;
            }
        }
        return audio;
    }
}
exports.Web = Web;
