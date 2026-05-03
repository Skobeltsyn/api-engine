import SessionContainer from "../../session/SessionContainer";
import CacheContainer from "../../models/CacheContainer";
import { log } from "../../util/Log";
import ApiEngineError from "../../models/ApiEngineError";
import ApiEngineHooks from "../ApiEngineHooks";

export default class FetchRequest {
    get priority(): number {
        return this._priority;
    }

    set priority(value: number) {
        this._priority = value;
    }
    numOfRetriesBeforeReject: number;
    url: URL;
    data: RequestInit;
    amountOfTries: number;
    sessionContainer: SessionContainer<any>;
    cacheContainer: CacheContainer | null;
    cacheKey: string | null;
    isBlob?: boolean;
    signal?: AbortSignal;
    hooks?: ApiEngineHooks;
    private _priority: number;

    madeResolve?: (value: (PromiseLike<unknown> | unknown)) => void;
    madeReject?: (value: (PromiseLike<unknown> | unknown)) => void;

    constructor(_url: URL, _data: RequestInit, _sessionContainer: SessionContainer<any>, _numOfRetriesBeforeReject: number, _cacheContainer: CacheContainer | null, _cacheKey: string | null, _signal?: AbortSignal, _hooks?: ApiEngineHooks) {
        this.numOfRetriesBeforeReject = _numOfRetriesBeforeReject;
        this.url = _url;
        this.cacheKey = _cacheKey;
        this.data = _data;
        this.sessionContainer = _sessionContainer;
        this.amountOfTries = 0;
        this.cacheContainer = _cacheContainer;
        this.signal = _signal;
        this.hooks = _hooks;
        this._priority = 0;

        this.generateHeadersWithAuthorization = this.generateHeadersWithAuthorization.bind(this);
    }

    generateHeaders():HeadersInit {
        return this.generateHeadersWithAuthorization();
    }

    generateContentTypeData() {
        let result = "application/json";
        const body = this.data.body;
        if (body && (body as object).constructor === FormData) {
            result = "multipart/form-data";
            log("Making form data");
            return undefined;
        }
        return result;
    }

    /** @deprecated Typo'd alias, use generateContentTypeData. */
    generateContentTypetData() {
        return this.generateContentTypeData();
    }

    generateAnonymousHeaders() {
        let headers = {
            'Accept': '*/*',
        } as any;
        let contentType = this.generateContentTypeData();
        if (contentType) {
            headers['Content-Type'] = contentType;
        }
        return headers;
    }

    generateHeadersWithAuthorization() {
        // alert(JSON.stringify(this.chatApp));
        // alert(JSON.stringify(this.chatApp.sessionContainer));
        // alert(JSON.stringify(this.chatApp.sessionContainer.jwtContainer));
        let jwtContainer = this.sessionContainer.jwtContainer;
        let headers = {} as any;
        if (!jwtContainer) {
            headers = {
                'Accept': '*/*',
            } as any;
        } else {
            headers = {
                'Accept': '*/*',
                "Authorization": jwtContainer.content,
                "csrf": jwtContainer.csrf
            } as any;
        }
        let contentType = this.generateContentTypeData();
        if (contentType) {
            headers['Content-Type'] = contentType;
        }
        return headers;
    }

    async perform():Promise<any> {
        let me = this;
        return new Promise(async (resolve, reject) => {
            me.amountOfTries += 1;
            if (me.signal?.aborted) {
                reject(new ApiEngineError("cancelled", "Request aborted before dispatch."));
                return;
            }
            let data: RequestInit = {... me.data};
            data.headers = this.generateHeaders();
            if (data.mode === undefined) data.mode = 'cors';
            if (me.signal && data.signal === undefined) data.signal = me.signal;

            if (me.hooks?.beforeRequest) {
                try {
                    const result = await me.hooks.beforeRequest(data, me.url);
                    if (result !== undefined) data = result;
                } catch (hookErr) {
                    reject(hookErr);
                    return;
                }
            }

            log(this.url);
            return fetch(this.url, data).then((e: Response) => {
                if (!e.ok) {
                    reject(e);
                    return;
                }
                if (me.isBlob) {
                    return e.blob();
                }
                return e.json()
            }).then(async (_res) => {
                if (_res) {
                    if (me.sessionContainer.jwtContainer)
                        if (_res.csrf) me.sessionContainer.jwtContainer.csrf = _res.csrf;
                }
                let final = _res;
                if (me.hooks?.transformResponse) {
                    try {
                        final = await me.hooks.transformResponse(_res, data);
                    } catch (hookErr) {
                        reject(hookErr);
                        return;
                    }
                }
                resolve(final);
            }).catch((e) => {
                log("Caught error", e);
                reject(e);
            });
        });
    }

    make():Promise<any> {
        let me = this;
        let promise = new Promise<any>((_resolve, _reject) => {
            me.madeResolve = _resolve;
            me.madeReject = _reject;
        });
        return promise;
    }
}