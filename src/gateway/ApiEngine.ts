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

    asyncFetch<T = any>(_url:string, _dataToSend: any, _signal?: AbortSignal): Promise<T> {
        return this.asyncFetchWithRetries<T>(_url, _dataToSend, 5, false, 0, _signal);
    }

    asyncFetchWithCache<T = any>(_url:string, _dataToSend: any, _signal?: AbortSignal): Promise<T> {
        log("Using cache");
        return this.prioritizedAsyncFetchWithCache<T>(_url, _dataToSend, 0, _signal);
    }

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
        let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, _cacheAnswer ? this.cacheContainer : null, _url, _signal);
        request.priority = _priority;
        const promise = request.make() as Promise<T>;
        me.requestsQueue.push(request);
        return promise;
    }

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

    testFetch(_expectedResult: any, _timeToAnswerInMs: number) {
        const me = this;
        me.testFetches.push({
            resolve: true, result: _expectedResult, timeToAnswerInMs: _timeToAnswerInMs
        })
    }

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
            let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url, _signal);
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
            let request = new FetchRequest(urlOrErr, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url, _signal);
            request.isBlob = true;

            request.perform().then((_res) => {
                _resolve(_res as T);
            }).catch((_e) => {
                _reject(_e);
            });
        });
    }

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