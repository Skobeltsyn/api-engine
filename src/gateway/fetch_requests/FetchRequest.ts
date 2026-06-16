import SessionContainer from "../../session/SessionContainer";
import CacheContainer from "../../models/CacheContainer";
import { log } from "../../util/Log";
import ApiEngineError from "../../models/ApiEngineError";
import ApiEngineHooks from "../ApiEngineHooks";
import { isCriticalError } from "../../util/criticalError";
import { buildRequestUrl } from "../../util/buildUrl";

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
    /** Ordered failover pool of base URLs. Empty => single-server (use `url`). */
    servers: string[] = [];
    /** Attempts per server before failing over to the next one. */
    failoverAttempts: number = 1;
    /** Mirrors ApiEngine.canUseOutsideLinks; used when rebuilding URLs per server. */
    canUseOutsideLinks: boolean = false;
    private authRetried: boolean = false;
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

    /**
     * Run the request. When {@link servers} is configured, fail over across the
     * pool on critical errors (network failures / 5xx): each server is tried up
     * to {@link failoverAttempts} times before advancing; a non-critical error
     * (4xx/auth) rejects immediately without failover; exhausting the pool
     * rejects with `all_servers_failed`. The final rejection is routed through
     * `transformError` exactly once (swallowed intermediate attempts are not).
     */
    async perform():Promise<any> {
        const me = this;
        try {
            if (me.servers && me.servers.length > 0) {
                return await me.performWithFailover();
            }
            return await me.performOnce(me.url);
        } catch (err) {
            if (me.hooks?.transformError) {
                throw await me.hooks.transformError(err);
            }
            throw err;
        }
    }

    /** Try each server in the pool up to `failoverAttempts` times. */
    private async performWithFailover():Promise<any> {
        const me = this;
        const path = me.cacheKey ?? String(me.url);
        const attempts = me.failoverAttempts > 0 ? me.failoverAttempts : 1;
        let lastErr: unknown = undefined;

        for (const base of me.servers) {
            const built = buildRequestUrl(base, path, me.canUseOutsideLinks);
            if (built instanceof ApiEngineError) {
                lastErr = built;
                continue; // malformed base URL — skip to the next server
            }
            for (let i = 0; i < attempts; i++) {
                try {
                    return await me.performOnce(built);
                } catch (err) {
                    lastErr = err;
                    // Only infrastructural/transient failures warrant failover.
                    if (!isCriticalError(err)) throw err;
                }
            }
        }
        throw new ApiEngineError(
            "all_servers_failed",
            `All ${me.servers.length} server(s) failed after ${attempts} attempt(s) each.`,
            lastErr
        );
    }

    /** A single fetch attempt against `targetUrl`. Rejects with the raw error. */
    private async performOnce(targetUrl: URL):Promise<any> {
        const me = this;
        return new Promise(async (resolve, reject) => {
            try {
                me.amountOfTries += 1;
                if (me.signal?.aborted) {
                    reject(new ApiEngineError("cancelled", "Request aborted before dispatch."));
                    return;
                }
                let data: RequestInit = {... me.data};
                data.headers = me.generateHeaders();
                if (data.mode === undefined) data.mode = 'cors';
                if (me.signal && data.signal === undefined) data.signal = me.signal;

                if (me.hooks?.beforeRequest) {
                    const result = await me.hooks.beforeRequest(data, targetUrl);
                    if (result !== undefined) data = result;
                }

                log(targetUrl);
                let response = await fetch(targetUrl, data);

                if (response.status === 401 && me.hooks?.onAuthFailure && !me.authRetried) {
                    me.authRetried = true;
                    await me.hooks.onAuthFailure(data, response);
                    // Re-issue once with regenerated headers (JWT may have changed).
                    const retryData: RequestInit = {... me.data};
                    retryData.headers = me.generateHeaders();
                    if (retryData.mode === undefined) retryData.mode = 'cors';
                    if (me.signal && retryData.signal === undefined) retryData.signal = me.signal;
                    response = await fetch(targetUrl, retryData);
                    data = retryData;
                }

                if (!response.ok) {
                    reject(response);
                    return;
                }

                const _res = me.isBlob ? await response.blob() : await response.json();
                if (_res) {
                    if (me.sessionContainer.jwtContainer && (_res as any).csrf) {
                        me.sessionContainer.jwtContainer.csrf = (_res as any).csrf;
                    }
                }
                let final: any = _res;
                if (me.hooks?.transformResponse) {
                    final = await me.hooks.transformResponse(_res, data);
                }
                resolve(final);
            } catch (e) {
                log("Caught error", e);
                reject(e);
            }
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