"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
async function retry(fun, time = 5, interval = 5000) {
    let tryTime = 0;
    let run;
    do {
        try {
            run = fun();
            return await run;
        }
        catch (error) {
            if (++tryTime > 0)
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
