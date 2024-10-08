"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
exports.sleep = sleep;
exports.exists = exists;
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
function sleep(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}
function exists(file) {
    return new Promise(resolve => { (0, fs_1.access)(file, fs_1.constants.F_OK, err => err ? resolve(false) : resolve(true)); });
}
