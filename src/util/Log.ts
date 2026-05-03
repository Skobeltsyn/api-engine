let _debug = false;

export function setDebug(value: boolean): void {
    _debug = value;
}

export function isDebug(): boolean {
    return _debug;
}

export function log(...args: unknown[]): void {
    if (_debug) console.log(...args);
}
