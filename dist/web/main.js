"use strict";
const config = {
    base: `${location.pathname}api/`,
    urlRegex: /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i,
};
Vue.use(VuetifyUploadButton);
const app = new Vue({
    el: "#app",
    components: {
        vueTelegramLogin,
    },
    data() {
        return {
            tg: {},
            isMobile: false,
            configLoaded: false,
            title: "",
            tgBotName: "",
            drop: {
                in: false,
                overlay: false,
                timer: 0,
            },
            upload: {
                uploading: false,
                total: 1,
                done: 0,
                current: "",
                encoding: false,
                file: true,
                single: false,
            },
            showDrawer: false,
            itemActing: {},
            itemDelete: {
                act: "",
                cb: null,
                dialog: false,
            },
            listModify: {
                act: "",
                dialog: false,
                name: "",
                nameRules: [
                    v => !!v || "請輸入名稱",
                    v => {
                        if (this.listModify.act === "edit") {
                            return this.itemActing.name !== v || "請修改名稱";
                        }
                        else {
                            return true;
                        }
                    },
                ],
                valid: false,
            },
            lists: [],
            listSelected: 0,
            listsHeaders: [
                {
                    align: "left",
                    sortable: false,
                    text: "清單名稱",
                    value: "name",
                },
                {
                    align: "center",
                    sortable: false,
                    text: "操作",
                    value: "act",
                    width: "72px",
                },
            ],
            audios: [],
            audioSelected: 0,
            audiosHeaders: [
                {
                    text: "歌名",
                    value: "title",
                    width: "50%",
                },
                {
                    text: "歌手",
                    value: "artist",
                    width: "40%",
                },
                {
                    text: "長度",
                    value: "duration",
                    width: "5%",
                },
                {
                    text: "操作",
                    value: "act",
                    width: "5%",
                },
            ],
        };
    },
    created() {
        this.isMobile = window.innerWidth < 769 ? true : false;
        if (!this.isMobile) {
            this.showDrawer = true;
        }
        this.loadConfig();
        this.refresh();
    },
    computed: {
        loggedIn() {
            return Object.keys(this.tg).length > 0;
        },
        uploadTotalProgress() {
            const base = this.upload.done * 100 / this.upload.total;
            const seg = 100.0 / this.upload.total;
            let add = 0;
            if (this.upload.file && this.upload.encoding) {
                add = seg;
            }
            else if (this.upload.single) {
                add = seg * this.upload.single / 100;
            }
            return base + add;
        },
        list() {
            const list = this.lists[this.listSelected];
            return list || {};
        },
    },
    watch: {
        list() {
            this.getAudios();
        },
        lists(newVal, oldVal) {
            const oldList = oldVal[this.listSelected];
            if (!oldList) {
                return;
            }
            let newIndex = 0;
            this.lists.forEach((list, idx) => {
                if (list.id === oldList.id) {
                    newIndex = idx;
                }
            });
            this.listSelected = newIndex;
        },
    },
    methods: {
        onAuth(tg) {
            this.tg = tg;
            this.api("get", "login").then(json => {
                this.refresh();
                console.log(json);
            }, json => {
                this.tg = {};
            });
        },
        onDragOver(evt) {
            if (this.loggedIn && !this.upload.uploading) {
                clearTimeout(this.drop.timer);
                this.drop.timer = setTimeout(() => {
                    this.drop.in = false;
                    clearTimeout(this.drop.timer);
                    this.drop.overlay = false;
                }, 100);
                if (!this.drop.in) {
                    this.drop.in = true;
                    this.drop.overlay = true;
                }
            }
        },
        onDrop(evt) {
            if (this.loggedIn && !this.upload.uploading) {
                this.audioAdd(evt.dataTransfer.items || evt.dataTransfer.files);
            }
        },
        onPaste(evt) {
            if (this.loggedIn && !this.upload.uploading) {
                this.audioAdd(evt.clipboardData.items);
            }
        },
        loadConfig() {
            this.api("get", "config").then(json => {
                this.title = json.title;
                this.tgBotName = json.tgBotName;
                this.configLoaded = true;
            });
        },
        refresh() {
            this.getLists();
        },
        api(act, path, body, uploadProgress) {
            const ep = `${config.base}${path}`;
            const conf = {
                headers: {
                    "X-Auth": JSON.stringify(this.tg),
                },
                uploadProgress,
            };
            const params = body ? [ep, body, conf] : [ep, conf];
            return new Promise((resolve, reject) => {
                const handle = res => {
                    res.json().then(resolve, reject);
                };
                this.$http[act](...params).then(handle, handle);
            });
        },
        itemDeleteCall() {
            if (this.itemDelete.cb) {
                this.itemDelete.cb();
            }
        },
        getLists() {
            this.api("get", "lists").then(json => {
                this.lists = json.lists.map((list, idx) => {
                    list.index = idx;
                    return list;
                });
            });
        },
        listDeleteConfirm(list) {
            this.itemActing = list;
            this.itemDelete.dialog = true;
            this.itemDelete.cb = this.listDeleteCall.bind(this);
        },
        listDeleteCall() {
            this.api("delete", `list/${this.itemActing.id}`).then(json => {
                this.itemDelete.dialog = false;
                this.getLists();
                console.log(json);
            });
        },
        listNewInput() {
            this.listModify.act = "new";
            this.listModify.name = "";
            this.listModify.dialog = true;
        },
        listEditInput(list) {
            this.itemActing = list;
            this.listModify.act = "edit";
            this.listModify.name = list.name;
            this.listModify.dialog = true;
        },
        listModifyCall() {
            if (this.$refs.listModify.validate()) {
                switch (this.listModify.act) {
                    case "new":
                        this.api("post", "lists", {
                            name: this.listModify.name,
                        }).then(json => {
                            this.listModify.dialog = false;
                            this.getLists();
                            console.log(json);
                        });
                        break;
                    case "edit":
                        this.api("patch", `list/${this.itemActing.id}`, {
                            name: this.listModify.name,
                        }).then(json => {
                            this.listModify.dialog = false;
                            this.getLists();
                            console.log(json);
                        });
                        break;
                }
            }
        },
        getAudios() {
            this.api("get", `list/${this.list.id}/audios`).then(json => {
                this.audios = json.audios.map((audio, idx) => {
                    audio.index = idx;
                    return audio;
                });
            });
        },
        audioDeleteConfirm(audio) {
            this.itemActing = audio;
            this.itemDelete.dialog = true;
            this.itemDelete.cb = this.audioDeleteCall.bind(this);
        },
        audioDeleteCall() {
            this.api("delete", `list/${this.list.id}/audio/${this.itemActing._id}`).then(json => {
                this.itemDelete.dialog = false;
                this.getAudios();
                console.log(json);
            });
        },
        async audioAdd(files) {
            this.upload.uploading = true;
            const arr = [];
            await Promise.all(Array.from(files).map(ele => {
                if (ele instanceof DataTransferItem) {
                    if (ele.kind === "file") {
                        arr.push(ele.getAsFile());
                    }
                    else if (ele.kind === "string") {
                        if (/^text\/uri-list/.exec(ele.type) || /^text\/plain/.exec(ele.type)) {
                            return new Promise((resolve, reject) => {
                                ele.getAsString((str) => {
                                    str.split("\n").forEach(l => {
                                        if (config.urlRegex.exec(l)) {
                                            try {
                                                const url = new URL(l);
                                                arr.push(url.href);
                                                return;
                                            }
                                            catch (e) {
                                            }
                                        }
                                    });
                                    resolve();
                                });
                            });
                        }
                    }
                }
                else if (ele instanceof File) {
                    arr.push(ele);
                }
            }));
            this.upload.total = arr.length;
            const consume = result => new Promise((resolve, reject) => {
                const ele = arr.pop();
                if (ele) {
                    let data;
                    if (ele instanceof File) {
                        data = new FormData();
                        data.append("audio", ele);
                        this.upload.current = ele.name;
                        this.upload.file = true;
                    }
                    else {
                        data = {
                            uris: [ele],
                        };
                        this.upload.current = ele;
                        this.upload.file = false;
                    }
                    this.upload.done = this.upload.total - arr.length - 1;
                    const handle = json => {
                        this.upload.encoding = false;
                        result.push({
                            ele,
                            json,
                        });
                        resolve(consume(result));
                    };
                    const upload = evt => {
                        if (evt.lengthComputable) {
                            const progress = evt.loaded * 100 / evt.total;
                            if (progress > 99) {
                                this.upload.single = false;
                                this.upload.encoding = true;
                            }
                            else {
                                this.upload.single = progress;
                            }
                        }
                        else {
                            this.upload.single = false;
                        }
                    };
                    this.api("post", `list/${this.list.id}/audios`, data, upload).then(handle, handle);
                }
                else {
                    resolve(result);
                }
            });
            consume([]).then(result => {
                this.upload.uploading = false;
                console.log(result);
                this.getAudios();
            });
        },
    },
});
