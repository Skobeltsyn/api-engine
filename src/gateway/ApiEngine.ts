import FetchRequest from "./fetch_requests/FetchRequest";
import RequestsQueue from "./fetch_requests/RequestsQueue";
import SessionContainer from "../session/SessionContainer";
import CacheContainer from "../models/CacheContainer";
import CQRSCommand from "../models/CQRSCommand";
import WebsocketConnector from "./websockets/WebsocketConnector";
import NullWebsocketConnector from "./websockets/NullWebsocketConnector";
import ApiEngineError from "../models/ApiEngineError";
import { setDebug, log } from "../util/Log";
import TestFetch from "./TestFetch";
import ApiEngineHooks from "./ApiEngineHooks";

export type ApiEngineEvent =
    | "request_started"
    | "request_succeeded"
    | "request_failed"
    | "request_retried";

export interface ApiEngineEventPayload {
    url: string;
    attempt: number;
    error?: unknown;
}

export default class ApiEngine {
    private testFetches: TestFetch[] = [];

    get websocketConnector(): WebsocketConnector {
        return this._websocketConnector;
    }

    set websocketConnector(value: WebsocketConnector) {
        this._websocketConnector = value;
    }


    private _websocketConnector: WebsocketConnector;


    get canUseOutsideLinks(): boolean {
        return this._canUseOutsideLinks;
    }

    set canUseOutsideLinks(value: boolean) {
        this._canUseOutsideLinks = value;
    }
    get cacheContainer(): CacheContainer {
        return this._cacheContainer;
    }

    set cacheContainer(value: CacheContainer) {
        this._cacheContainer = value;
    }
    private _canUseOutsideLinks: boolean;
    requestsFetchingRate: number;
    requestsQueue?: RequestsQueue;
    serverUrl: string;
    sessionContainer: SessionContainer<any>;
    private _cacheContainer: CacheContainer;
    private _debug: boolean = false;

    get debug(): boolean { return this._debug; }
    set debug(value: boolean) {
        this._debug = value;
        setDebug(value);
    }

    /** Optional pluggable interceptors. See {@link ApiEngineHooks}. */
    public hooks: ApiEngineHooks = {};

    get beforeRequest(): ApiEngineHooks["beforeRequest"] { return this.hooks.beforeRequest; }
    set beforeRequest(v: ApiEngineHooks["beforeRequest"]) { this.hooks.beforeRequest = v; }

    private _listeners: { [k in ApiEngineEvent]?: Array<(payload: ApiEngineEventPayload) => void> } = {};

    on(event: ApiEngineEvent, handler: (payload: ApiEngineEventPayload) => void): void {
        (this._listeners[event] ||= []).push(handler);
    }

    off(event: ApiEngineEvent, handler: (payload: ApiEngineEventPayload) => void): void {
        const arr = this._listeners[event];
        if (!arr) return;
        const idx = arr.indexOf(handler);
        if (idx > -1) arr.splice(idx, 1);
    }

    emit(event: ApiEngineEvent, payload: ApiEngineEventPayload): void {
        const arr = this._listeners[event];
        if (!arr) return;
        for (const h of arr.slice()) {
            try { h(payload); } catch (e) { /* ignore handler errors */ }
        }
    }

    /**
     * Build an ApiEngine.
     * @param _serverUrl Base URL prepended to relative paths.
     * @param _requestsFetchingRate Minimum delay between queued requests, in ms.
     * @param _sessionContainer SessionContainer that owns the JWT and current user.
     */
    constructor(_serverUrl: string,
                _requestsFetchingRate: number,
                _sessionContainer: SessionContainer<any>) {
        this.serverUrl = _serverUrl;
        this.requestsFetchingRate = _requestsFetchingRate;
        this.sessionContainer = _sessionContainer;
        this.sessionContainer.apiEngine = this;
        this.startQueue = this.startQueue.bind(this);
        this.asyncFetch = this.asyncFetch.bind(this);
        this.asyncFetchWithCache = this.asyncFetchWithCache.bind(this);
        this.prioritizedAsyncFetchWithCache = this.prioritizedAsyncFetchWithCache.bind(this);
        this.asyncFetchWithRetries = this.asyncFetchWithRetries.bind(this);
        this.whatsWrong = this.whatsWrong.bind(this);

        this.asyncFetchWithoutQueing = this.asyncFetchWithoutQueing.bind(this);
        this.cleanQueue = this.cleanQueue.bind(this);
        this.updateToken = this.updateToken.bind(this);

        this.asyncFetchBlobWithoutQueing = this.asyncFetchBlobWithoutQueing.bind(this);
        this.corsFetch = this.corsFetch.bind(this);
        this.testFetch = this.testFetch.bind(this);
        this.testFetchAndFail = this.testFetchAndFail.bind(this);

        this._canUseOutsideLinks = false;

        this._cacheContainer = new CacheContainer("default_api_storage");

        this._websocketConnector = new NullWebsocketConnector("/", this);
    }

    /**
     * Start (or restart) the request queue. Must be called before any fetch
     * methods that use the queue.
     */
    startQueue() {
        const me = this;
        log("Starting queing process");
        if (!this.requestsQueue) {
            log("Creating queue");
            this.requestsQueue = new RequestsQueue(me.requestsFetchingRate, me);
            log("Starting queue");
            this.requestsQueue.start();
        } else {
            log("Restarting queue");
            this.requestsQueue.start();
        }
    }

    /**
     * Issue a queued fetch with the default 5 retries and no caching.
     * @param _url Path or absolute URL.
     * @param _dataToSend Fetch RequestInit (method, body, headers, ...).
     * @param _signal Optional AbortSignal to cancel the request.
     */
    asyncFetch<T = any>(_url:string, _dataToSend: any, _signal?: AbortSignal): Promise<T> {
        return this.asyncFetchWithRetries<T>(_url, _dataToSend, 5, false, 0, _signal);
    }

    /**
     * Like {@link asyncFetch} but checks the cache first; on miss, caches the
     * successful response.
     */
    asyncFetchWithCache<T = any>(_url:string, _dataToSend: any, _signal?: AbortSignal): Promise<T> {
        log("Using cache");
        return this.prioritizedAsyncFetchWithCache<T>(_url, _dataToSend, 0, _signal);
    }

    /**
     * Cached fetch with explicit queue priority.
     * @param _priority Higher number = served sooner inside the queue.
     */
    prioritizedAsyncFetchWithCache<T = any>(_url:string, _dataToSend: any, _priority: number, _signal?: AbortSignal): Promise<T> {
        log(`Checking for key ${_url}`);
        let cachedData = this.cacheContainer.getKey(_url);
        if (cachedData)
            return new Promise<T>((_resolve) => {
                _resolve(cachedData as T);
            });

        return this.asyncFetchWithRetries<T>(_url, _dataToSend, 5, true, _priority, _signal);
    }

    private buildUrlOrReject(_url: string): URL | ApiEngineError {
        const me = this;
        const isExternal = (_url.indexOf("https://") > -1) || (_url.indexOf("http://") > -1);
        const raw = isExternal && me.canUseOutsideLinks
            ? _url.replace(/([^:]\/)\/+/g, "$1")
            : `${me.serverUrl}/${_url}`.replace(/([^:]\/)\/+/g, "$1");
        try {
            return new URL(raw);
        } catch (e) {
            return new ApiEngineError(
                "url_invalid",
                `Could not parse URL "${raw}": ${(e as Error).message}`
            );
        }
    }

    /**
     * Lower-level fetch entry point that exposes retry count, caching, and
     * priority. Other fetch methods are convenience wrappers around this.
     */
    asyncFetchWithRetries<T = any>(_url:string, _dataToSend: any, _numOfRetriesBeforeReject: number, _cacheAnswer: boolean, _priority: number, _signal?: AbortSignal): Promise<T> {
        const me = this;
        if (me.testFetches.length > 0) {
            const testFetch = me.testFetches.pop()!;
            return new Promise<T>((_resolve, _reject) => {
               if (testFetch.resolve) {
                   setTimeout(() => {
                    _resolve(testFetch.result as T);
                   }, testFetch.timeToAnswerInMs);
               } else {
                   setTimeout(() => {
                       _reject(testFetch.result);
                   }, testFetch.timeToAnswerInMs);
               }
            });
        }
        const urlOrErr = me.buildUrlOrReject(_url);
        if (urlOrErr instanceof ApiEngineError) return Promise.reject(urlOrErr);
        if (!me.requestsQueue) return me.whatsWrong() as Promise<T>;
        let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, _cacheAnswer ? this.cacheContainer : null, _url, _signal, this.hooks);
        request.priority = _priority;
        const promise = request.make() as Promise<T>;
        me.requestsQueue.push(request);
        return promise;
    }

    /**
     * Issue a CQRS command: post the command, then poll the ticket endpoint
     * until the server reports completion.
     * @param _updateCallback Optional callback fired on each poll with the
     *   intermediate status string.
     */
    corsFetch<T = any>(
        _command: string,
        _params: any,
        _isBlob: boolean,
        _sendUrl: string,
        _ticketCheckEndPoint: string,
        _updateCallback: undefined | ((_res: string) => void) = undefined
    ): Promise<T> {
        return new Promise<T>((_resolve, _reject) => {
            let cqrsCommand = new CQRSCommand(
                _command,
                _params,
                _isBlob,
                _sendUrl,
                this,
                1000,
                _ticketCheckEndPoint,
                _updateCallback
            );

            cqrsCommand.makeRequest().then((res) => _resolve(res as T), _reject);
        });
    }

    /**
     * Push a stubbed success response. The next fetch call (any variant) pops
     * this and resolves with `_expectedResult` after `_timeToAnswerInMs` ms.
     */
    testFetch(_expectedResult: any, _timeToAnswerInMs: number) {
        const me = this;
        me.testFetches.push({
            resolve: true, result: _expectedResult, timeToAnswerInMs: _timeToAnswerInMs
        })
    }

    /**
     * Push a stubbed failure response. The next fetch call rejects with
     * `_expectedFail` after `_timeToAnswerInMs` ms.
     */
    testFetchAndFail(_expectedFail: any, _timeToAnswerInMs: number) {
        const me = this;
        me.testFetches.push({
            resolve: false, result: _expectedFail, timeToAnswerInMs: _timeToAnswerInMs
        })
    }

    asyncFetchWithoutQueing<T = any>(_url:string, _dataToSend: any, _numOfRetriesBeforeReject=0, _signal?: AbortSignal): Promise<T> {
        const me = this;
        if (me.testFetches.length > 0) {
            const testFetch = me.testFetches.pop()!;
            return new Promise<T>((_resolve, _reject) => {
                setTimeout(
                    () => (testFetch.resolve ? _resolve(testFetch.result as T) : _reject(testFetch.result)),
                    testFetch.timeToAnswerInMs,
                );
            });
        }
        const urlOrErr = me.buildUrlOrReject(_url);
        if (urlOrErr instanceof ApiEngineError) return Promise.reject(urlOrErr);

        return new Promise<T>((_resolve, _reject) => {
            let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url, _signal, this.hooks);
            request.perform().then((_res) => {
                _resolve(_res as T);
            }, (_err) => {
                _reject(_err);
            });
        });
    }

    async asyncFetchBlobWithoutQueing<T = any>(_url:string, _dataToSend: any, _numOfRetriesBeforeReject=0, _signal?: AbortSignal):Promise<T> {
        const me = this;
        if (me.testFetches.length > 0) {
            const testFetch = me.testFetches.pop()!;
            return new Promise<T>((_resolve, _reject) => {
                setTimeout(
                    () => (testFetch.resolve ? _resolve(testFetch.result as T) : _reject(testFetch.result)),
                    testFetch.timeToAnswerInMs,
                );
            });
        }
        const urlOrErr = me.buildUrlOrReject(_url);
        if (urlOrErr instanceof ApiEngineError) return Promise.reject(urlOrErr);
        return new Promise<T>((_resolve, _reject) => {
            let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url, _signal, this.hooks);
            request.isBlob = true;

            request.perform().then((_res) => {
                _resolve(_res as T);
            }).catch((_e) => {
                _reject(_e);
            });
        });
    }

    /** Drop all pending queue entries; the active request is rejected. */
    cleanQueue() {
        if (this.requestsQueue) this.requestsQueue.clean();
    }

    whatsWrong() {
        const me = this;
        return new Promise((resolve, reject) => {
            if (!me.requestsQueue) {
                reject(new ApiEngineError(
                    "queue_not_initialized",
                    "RequestsQueue is not initialized — call apiEngine.startQueue() before issuing requests."
                ));
                return;
            }
            reject(new ApiEngineError("queue_not_initialized", "Unknown queue error."));
        })
    }

    updateToken(_token: string) {
        this.sessionContainer.updateToken(_token);
    }
}