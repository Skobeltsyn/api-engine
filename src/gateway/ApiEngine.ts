import FetchRequest from "./fetch_requests/FetchRequest";
import RequestsQueue from "./fetch_requests/RequestsQueue";
import SessionContainer from "../session/SessionContainer";
import CacheContainer from "../models/CacheContainer";

export default class ApiEngine {
    get cacheContainer(): CacheContainer {
        return this._cacheContainer;
    }

    set cacheContainer(value: CacheContainer) {
        this._cacheContainer = value;
    }

    requestsFetchingRate: number;
    requestsQueue?: RequestsQueue;
    serverUrl: string;
    sessionContainer: SessionContainer<any>;
    private _cacheContainer: CacheContainer;

    constructor(_serverUrl: string,
                _requestsFetchingRate: number,
                _sessionContainer: SessionContainer<any>) {
        this.serverUrl = _serverUrl;
        this.requestsFetchingRate = _requestsFetchingRate;
        this.sessionContainer = _sessionContainer;
        this.sessionContainer.apiEngine = this;
        this.startQueue = this.startQueue.bind(this);
        this._cacheContainer = new CacheContainer("default_api_storage");
    }

    startQueue() {
        let me = this;
        console.log("Starting queing process");
        if (!this.requestsQueue) {
            console.log("Creating queue");
            this.requestsQueue = new RequestsQueue(me.requestsFetchingRate, me);
            console.log("Starting queue");
            this.requestsQueue.start();
        } else {
            console.log("Restarting queue");
            this.requestsQueue.start();
        }
    }

    asyncFetch(_url:string, _dataToSend: any) {
        return this.asyncFetchWithRetries(_url, _dataToSend, 5, false, 0);
    }

    asyncFetchWithCache(_url:string, _dataToSend: any) {
        return this.prioritizedAsyncFetchWithCache(_url, _dataToSend, 0);
    }

    prioritizedAsyncFetchWithCache(_url:string, _dataToSend: any, _priority: number) {
        let cachedData = this.cacheContainer.getKey(_url);
        if (cachedData)
            return new Promise((_resolve) => {
                _resolve(cachedData);
            });

        return this.asyncFetchWithRetries(_url, _dataToSend, 5, true, _priority);
    }

    asyncFetchWithRetries(_url:string, _dataToSend: any, _numOfRetriesBeforeReject: number, _cacheAnswer: boolean, _priority: number) {
        let me = this;
        let url = new URL(`${me.serverUrl}/${_url}`);
        if (!me.requestsQueue) return me.whatsWrong();
        let request = new FetchRequest(url, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, _cacheAnswer ? this.cacheContainer : null, _url);
        request.priority = _priority;
        me.requestsQueue.push(request);
        return request.make();
    }

    whatsWrong() {
        let me = this;
        return new Promise((resolve, reject) => {
            let reason = "";
            if (!me.requestsQueue) reason += "Не инициализировано requestsQueue;";
            reject(reason)
        })
    }
}