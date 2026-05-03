import JWTContainer from "../models/JWTContainer";
import ApiEngine from "../gateway/ApiEngine";
import { log } from "../util/Log";

export default class SessionContainer<UserClass> {
    private meUrl: string;

    get apiEngine(): ApiEngine {
        if (!this._apiEngine) throw "No API engine set";
        return this._apiEngine;
    }

    set apiEngine(value: ApiEngine) {
        this._apiEngine = value;
    }
    userClassAsObject: any;
    private _apiEngine: ApiEngine | null

    constructor(_userClassAsObject: any, _meUrl: string) {
        this._apiEngine = null;
        this.meUrl = _meUrl;
        this._currentUser = null;
        this.userClassAsObject = _userClassAsObject;
        this.jwtContainer = JWTContainer.tryToRestoreJWT();

        this.updateToken = this.updateToken.bind(this);
        this.refresh = this.refresh.bind(this);
    }

    updateToken(_token: string) {
       localStorage.setItem("jwt", _token);
       let csrfString = localStorage.getItem("csrf");
       localStorage.setItem("csrf", csrfString ? csrfString : "");
       this.jwtContainer = JWTContainer.tryToRestoreJWT();
    }

    refresh() {
        this.jwtContainer = JWTContainer.tryToRestoreJWT();
    }

    clearJwt() {
        localStorage.removeItem("jwt");
        localStorage.removeItem("csrf");
        this._jwtContainer = null;
        this._currentUser = null;
    }

    get currentEntity(): UserClass {
        if (!this._currentUser) throw "No user";
        return this._currentUser;
    }

    set currentEntity(value: UserClass) {
        this._currentUser = value;
    }

    get currentUser(): UserClass | null {
        return this._currentUser;
    }

    set currentUser(value: UserClass | null) {
        this._currentUser = value;
    }

    private _currentUser: UserClass | null;
    private _jwtContainer?: JWTContainer | null | undefined;

    set jwtContainer(value: JWTContainer | null | undefined) {
        this._jwtContainer = value;
        if (this._jwtContainer) {
            // alert(123);
            this._jwtContainer.writeToLocalStorage();
        }
    }

    get jwtContainer():JWTContainer | null  | undefined {
        return this._jwtContainer;
    }

    checkUser():Promise<UserClass> {
        let me = this;
        if (!me.apiEngine) throw new Error("API Engine is not set");
        log("checkUser");
        return new Promise((resolve, reject) => {
            if (!me._jwtContainer) {
                console.error("No JWT");
                reject("No JWT");
                return;
            }
            log("Sending request");
            me.apiEngine.asyncFetch(me.meUrl, {}).then((e: any) => {
                log("Got response");
                if (!e) {
                    console.error("Empty answer");
                    reject("Empty answer");
                    return;
                }

                if (e || me._jwtContainer) {
                    log("Setting user");
                    try {
                        me._currentUser = (new me.userClassAsObject(e)) as UserClass;
                        resolve(me._currentUser);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    console.error("Answering error");
                    reject(false);
                }
            }, (e) => {
                console.error("Something went wrong");
                if (me._jwtContainer) me._jwtContainer.revoke();
                reject(e);
            });
        });
    }


}