import JWTContainer from "../models/JWTContainer";
import ApiEngine from "../gateway/ApiEngine";

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
        if (!me.apiEngine) throw new Error("Не задан API Engine");
        console.log("checkUser");
        return new Promise((resolve, reject) => {
            console.log("Sending request");
            me.apiEngine.asyncFetch(me.meUrl, {}).then((e: any) => {
                console.log("Sending request");
                if (!e) {console.error("Empty answer");}
                if (!me._jwtContainer) {console.error("No JWT");}

                if (e || me._jwtContainer) {
                    // me._currentUser = (new me.userClassAsObject(e.uuid)) as UserClass;
                    console.log("Setting user");
                    me._currentUser = (new me.userClassAsObject(e)) as UserClass;
                    resolve(me._currentUser);
                    // alert(JSON.stringify(e));
                } else {
                    console.error("Answering error");
                    reject(false);
                }
            }, (e) => {
                console.error("Something went wrong");
                if (me._jwtContainer) me._jwtContainer.revoke();
            });
        });
    }


}