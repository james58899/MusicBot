export async function retry<T>(fun: () => Promise<T>, time: number = 5, interval: number = 5000) {
    let tryTime = 0;
    let run: Promise<T>;

    do {
        try {
            run = fun();
            return await run;
        } catch (error) {
            if (++tryTime > 0) interval = interval * 2;
        }
        await sleep(interval);
    } while (tryTime < time);

    return run!;
}

export function sleep(time: number) {
    return new Promise(resolve => setTimeout(resolve, time));
}
