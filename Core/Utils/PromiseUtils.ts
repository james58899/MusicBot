import { access, constants } from "fs";

export async function retry<T>(fun: () => Promise<T>, time = 5, interval = 5000, increase = true) {
    let tryTime = 0;
    let run: Promise<T>;

    do {
        try {
            run = fun();
            return await run;
        } catch (error) {
            if (++tryTime > 0 && increase) interval = interval * 2;
        }
        await sleep(interval);
    } while (tryTime < time);

    return run!;
}

export function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}

export function exists(file: string) {
    return new Promise(resolve => {access(file, constants.F_OK, err => err ? resolve(false) : resolve(true)); });
}
