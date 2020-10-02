"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exists = exports.sleep = exports.retry = void 0;
const fs_1 = require("fs");
async function retry(fun, time = 5, interval = 5000, increase = true) {
    let tryTime = 0;
    let run;
    do {
        try {
            run = fun();
            return await run;
        }
        catch (error) {
            if (++tryTime > 0 && increase)
                interval = interval * 2;
        }
        await sleep(interval);
    } while (tryTime < time);
    return run;
}
exports.retry = retry;
function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}
exports.sleep = sleep;
function exists(file) {
    return new Promise(resolve => { fs_1.access(file, fs_1.constants.F_OK, err => err ? resolve(false) : resolve(true)); });
}
exports.exists = exists;
