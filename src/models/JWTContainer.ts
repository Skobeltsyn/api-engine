import { log } from "../util/Log";

export default class JWTContainer {
    private readonly _content: string
    private _csrf: string


    get content(): string {
        return this._content;
    }

    get csrf(): string {
        return this._csrf;
    }

    set csrf(val: string) {
        this._csrf = val;
        this.writeToLocalStorage();
    }

    constructor(_content: string, _csrf: string) {
        this._content = _content;
        this._csrf = _csrf;
        log("JWT enabled");
    }

    static tryToRestoreJWT():JWTContainer | null {
        let contentFromLocalStorage = localStorage.getItem("jwt");
        log("Got jwt");
        let csrfFromLocalStorage    = localStorage.getItem("csrf");
        log("Got csrf");
        if (!csrfFromLocalStorage) {
            throw new Error("csrf key in local storage should be enabled, or set something like 'no csff' if not desired");
        }

        if (contentFromLocalStorage && csrfFromLocalStorage)
            return new JWTContainer(contentFromLocalStorage, csrfFromLocalStorage);
        return null;
    }

    writeToLocalStorage() {
        if (this._content && this._csrf) {
            localStorage.setItem("jwt", this._content);
            localStorage.setItem("csrf", this._csrf);
            log("Written to localstorage");
        } else {
            console.error(`Did not write to localstorage: content: ${!!this._content}, csrf: ${!!this._csrf}`);
        }
    }

    revoke() {
        localStorage.removeItem("jwt");
        localStorage.removeItem("csrf");
        document.location.reload();
    }
}