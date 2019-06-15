import crypto from "crypto";
import { Application, NextFunction, Request, Response } from "express";
import express from "express";
import { promises as fsp } from "fs";
import { ObjectID } from "mongodb";
import multer from "multer";
import { Core } from "..";
import { AudioManager, ERR_MISSING_TITLE, IAudioData } from "../Core/AudioManager";
import { IAudioList, ListManager } from "../Core/ListManager";
import { IUserData, UserManager } from "../Core/UserManager";
// import { retry, sleep } from "../Core/Utils/PromiseUtils";

export const BIND_TYPE = "telegram"; // "web";
const ERR_MISSING_TOKEN = Error("Telegram bot api token not found!");
// const ERR_NOT_VALID_TITLE = Error("Not valid title");
// const ERR_LIST_NOT_FOUND = Error("Playlist not found");
const ERR_BAD_REQUEST = "Maybe wrong paramters!";
const ERR_FORBIDDEN = "You're not allowed to do this!";
const ERR_NOT_REGISTER = "Please use /register to register or bind account via Telegram!";
const ERR_NOT_FOUND = "File disappeared!";

export class Web {
    private audio: AudioManager;
    private user: UserManager;
    private list: ListManager;
    private tgToken: string;
    private upload: string;
    private server: Application;

    constructor(core: Core) {
        if (!core.config.telegram.token) throw ERR_MISSING_TOKEN;

        this.user = core.userManager;
        this.audio = core.audioManager;
        this.list = core.listManager;

        this.tgToken = core.config.telegram.token;
        this.upload = core.config.web.upload;

        // Create Server
        this.server = express();

        this.middlewares();
        this.registerRoutes();
        this.errorHandler();

        this.server.listen(8081);
    }

    private async middlewares() {
        // outdated... workaround
        this.server.use((express as any).json()); // for parsing application/json
    }

    private async errorHandler() {
        this.server.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            if (err.message.startsWith("HTTP400")) {
                res.status(400).json({
                    error: ERR_BAD_REQUEST
                });
            } else if (err.message.startsWith("HTTP401")) {
                res.status(401).json({
                    error: ERR_NOT_REGISTER
                });
            } else if (err.message.startsWith("HTTP403")) {
                res.status(403).json({
                    error: ERR_FORBIDDEN
                });
            } else if (err.message.startsWith("HTTP404")) {
                res.status(404).json({
                    error: ERR_NOT_FOUND
                });
            } else {
                next(err);
            }
        });
    }

    private route(fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void) {
        return (req: Request, res: Response, next: NextFunction) => {
            const promise = fn.bind(this)(req, res, next);
            if (promise instanceof Promise) {
                promise.catch(next);
            }
        };
    }

    private async registerRoutes() {
        const upload = multer({ dest: this.upload });

        this.server.get("/", (req: Request, res: Response) => res.send("MusicBot Web Server"));
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

    private async getLogin(req: Request, res: Response) {
        const user = await this.checkUser(req);
        res.json({
            msg: "OK",
            user
        });
    }

    private async getLists(req: Request, res: Response) {
        const user = await this.getUser(req);
        const lists = await this.list.getAll().map((list: IAudioList) => {
            return {
                id: list._id,
                name: list.name,
                own: !!user && user._id!.equals(list.owner)
            };
        }).toArray();
        const own: any[] = [];
        const other: any[] = [];
        lists.forEach(list => {
            if (list.own) {
                own.push(list);
            } else {
                other.push(list);
            }
        });
        res.json({
            lists: [...own, ...other],
            msg: "OK"
        });
    }

    private async postLists(req: Request, res: Response) {
        const user = await this.checkUser(req);
        const name = (req as any).body.name;
        if (!name) {
            throw Error("HTTP400");
        }
        const list = await this.list.create(name, user._id!);
        res.json({
            list,
            msg: "OK"
        });
    }

    private async getList(req: Request, res: Response) {
        const list = await this.list.get(new ObjectID(req.params.lid));
        res.json({
            list,
            msg: "OK"
        });
    }

    private async patchList(req: Request, res: Response) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new ObjectID(req.params.lid));
        const name = (req as any).body.name;
        if (!name) {
            throw Error("HTTP400");
        }
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id!.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.rename(list._id, name);
        res.json({
            msg: "OK",
            result
        });
    }

    private async deleteList(req: Request, res: Response) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id!.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.delete(list._id);
        res.json({
            msg: "OK",
            result
        });
    }

    private async getListAudios(req: Request, res: Response) {
        const list = await this.list.get(new ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        const audios = await this.audio.search({
            _id: {
                $in: list.audio.map(id => new ObjectID(id))
            }
        }).toArray();
        res.json({
            audios,
            msg: "OK"
        });
    }

    private async postListAudios(req: Request, res: Response) {
        try {
            const user = await this.checkUser(req);
            const list = await this.list.get(new ObjectID(req.params.lid));
            if (!list) {
                throw Error("HTTP404");
            }
            if (!user._id!.equals(list.owner)) {
                throw Error("HTTP403");
            }
            const audios: IAudioData[] = [];
            await Promise.all((req as any).files.map(async (file: any) => {
                const path = file.path;
                const audio = await this.processFile(path, user);
                if (audio) {
                    await this.list.addAudio(list._id!, audio._id!);
                    audios.push(audio);
                } else {
                    // failed
                }
            }));
            res.json({
                audios,
                msg: "OK"
            });
        } finally {
            await Promise.all((req as any).files.map(async (file: any) => await fsp.unlink(file.path)));
        }
    }

    private async deleteListAudio(req: Request, res: Response) {
        const user = await this.checkUser(req);
        const list = await this.list.get(new ObjectID(req.params.lid));
        if (!list) {
            throw Error("HTTP404");
        }
        if (!user._id!.equals(list.owner)) {
            throw Error("HTTP403");
        }
        const result = await this.list.delAudio(list._id, new ObjectID(req.params.aid));
        res.json({
            msg: "OK",
            result
        });
    }

    private async getAudio(req: Request, res: Response) {
        const audio = await this.audio.get(new ObjectID(req.params.aid));
        res.json({
            audio,
            msg: "OK"
        });
    }

    private async getAudioFile(req: Request, res: Response) {
        const audio = await this.audio.get(new ObjectID(req.params.aid));
        if (!audio) {
            throw Error("HTTP404");
        }
        const file = await this.audio.getFile(audio);
        if (!file) {
            throw Error("HTTP404");
        }
        res.download(file);
    }

    private async getUser(req: Request) {
        const tgStr = req.get("X-Auth");
        if (!tgStr) return null;
        const tg = JSON.parse(tgStr);
        const payload = [
            `auth_date=${tg.auth_date}`,
            `first_name=${tg.first_name}`,
            `id=${tg.id}`,
            `username=${tg.username}`
        ].join("\n");
        const hmac = crypto.createHmac("sha256", this.tgToken);
        hmac.update(payload);
        if (hmac.digest("hex") !== tg.hash) {
            // return null;
        }
        return this.user.get(BIND_TYPE, tg.id);
    }

    private async checkUser(req: Request) {
        const user = await this.getUser(req);
        if (!user) {
            throw Error("HTTP401");
        }
        return user;
    }

    private async processFile(file: string, sender: IUserData) {
        if (!file) return null;

        let audio;
        try {
            audio = await this.audio.add(sender._id!, file);
        } catch (error) {
            if (error === ERR_MISSING_TITLE) {
                // show error ?
                return null;
            } else {
                // unkown dead
                return null;
            }
        }

        return audio;
    }

}
