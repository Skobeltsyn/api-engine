import FetchRequest from "./fetch_requests/FetchRequest";
import RequestsQueue from "./fetch_requests/RequestsQueue";
import SessionContainer from "../session/SessionContainer";
import CacheContainer from "../models/CacheContainer";
import CQRSCommand from "../models/CQRSCommand";
import WebsocketConnector from "./websockets/WebsocketConnector";
import NullWebsocketConnector from "./websockets/NullWebsocketConnector";

export default class ApiEngine {

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

        this._canUseOutsideLinks = false;

        this._cacheContainer = new CacheContainer("default_api_storage");

        this._websocketConnector = new NullWebsocketConnector("/", this);
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
        console.log("Using cache");
        return this.prioritizedAsyncFetchWithCache(_url, _dataToSend, 0);
    }

    prioritizedAsyncFetchWithCache(_url:string, _dataToSend: any, _priority: number) {
        console.log(`Checking for key ${_url}`);;
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
        if ( (_url.indexOf("https://") > -1) || (_url.indexOf("http://") > -1) ) {
            if (me.canUseOutsideLinks) {
                url = new URL(_url);
            }
        }
        if (!me.requestsQueue) return me.whatsWrong();
        let request = new FetchRequest(url, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, _cacheAnswer ? this.cacheContainer : null, _url);
        request.priority = _priority;
        me.requestsQueue.push(request);
        return request.make();
    }

    corsFetch(
        _command: string,
        _params: any,
        _isBlob: boolean,
        _sendUrl: string,
        _ticketCheckEndPoint: string,
        _updateCallback: undefined | ((_res: string) => void) = undefined
    ) {
        return new Promise((_resolve) => {
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

            cqrsCommand.makeRequest().then((_res: any) => {
                _resolve(_res);
            })
        });
    }

    asyncFetchWithoutQueing(_url:string, _dataToSend: any, _numOfRetriesBeforeReject=0) {
        let me = this;
        let url = new URL(`${me.serverUrl}/${_url}`);

        return new Promise((_resolve) => {
            if ( (_url.indexOf("https://") > -1) || (_url.indexOf("http://") > -1) ) {
                if (me.canUseOutsideLinks) {
                    url = new URL(_url);
                }
            }

            let request = new FetchRequest(url, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url);
            request.perform().then((_res) => {
                _resolve(_res);
            });
        });
    }

    async asyncFetchBlobWithoutQueing(_url:string, _dataToSend: any, _numOfRetriesBeforeReject=0):Promise<any> {
        let me = this;
        let url = new URL(`${me.serverUrl}/${_url}`);

        return new Promise<any>((_resolve, _reject) => {
            if ( (_url.indexOf("https://") > -1) || (_url.indexOf("http://") > -1) ) {
                if (me.canUseOutsideLinks) {
                    url = new URL(_url);
                }
            }

            let request = new FetchRequest(url, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject, null, _url);
            request.isBlob = true;

            request.perform().then((_res) => {
                _resolve(_res);
            }).catch((_e) => {
                _reject(_e);
            });
        });
    }

    cleanQueue() {
        if (this.requestsQueue) this.requestsQueue.clean();
    }

    whatsWrong() {
        let me = this;
        return new Promise((resolve, reject) => {
            let reason = "";
            if (!me.requestsQueue) reason += "Не инициализировано requestsQueue;";
            reject(reason)
        })
    }

    updateToken(_token: string) {
        this.sessionContainer.updateToken(_token);
    }
}