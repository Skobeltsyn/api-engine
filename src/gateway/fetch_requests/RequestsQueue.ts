import FetchRequest from "./FetchRequest";
import ApiEngine from "../ApiEngine";

export default class RequestsQueue {
    private requestsFetchingRate: number;
    private requests: FetchRequest[];
    private requestsNumber: number;
    private active: boolean;
    private timeoutForUpdate: ReturnType<typeof setTimeout> | undefined;
    private apiEngine: ApiEngine;
    private activeRequest: FetchRequest | null;

    constructor(_requestsFetchingRate: number, _api: ApiEngine) {
        this.requests = [];
        this.requestsNumber = 0;
        this.requestsFetchingRate = _requestsFetchingRate;
        this.active = false;
        this.activeRequest = null;
        this.apiEngine = _api;
        this.processRequest = this.processRequest.bind(this);
        this.clean = this.clean.bind(this);
    }

    clean() {
        if (this.activeRequest) {
            if (this.activeRequest.madeReject)
                this.activeRequest.madeReject({});
        }
        this.requests.splice(0,this.requests.length);
    }

    push(_req: FetchRequest) {
        this.requests.push(_req);
    }

    start() {
        this.active = true;
        this.timeoutForUpdate = setTimeout(this.processRequest, 100);
        console.log("Queue started");
    }

    stop() {
        console.log("Stopping Queue");
        this.active = false;
        clearTimeout(this.timeoutForUpdate);
    }

    processRequest() {
        let me = this;
        let request = null as (FetchRequest | null);
        let requestIndex = 0;
        if (me.requests.length > 0) {
            request = me.requests[requestIndex];

            for(let i = 1; i < me.requests.length; i++) {
                let other = me.requests[i];
                if (other === null) continue;
                if (other === undefined) continue;
                if (request.priority < other.priority) {
                    request = other;
                    requestIndex = i;
                }
            }
            me.requests.splice(requestIndex, 1);
        }

        if (request === undefined || request === null) {
            clearTimeout(this.timeoutForUpdate);
            this.timeoutForUpdate = setTimeout(() => { me.processRequest.bind(me); me.processRequest(); }, me.requestsFetchingRate);
            return;
        }
        me.requestsNumber += 1;
        me.activeRequest = request;
        request.perform().then((_res) => {
            if (request !== null && request !== undefined && request.madeResolve) {
                clearTimeout(me.timeoutForUpdate);
                me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
                // if (me.chatApp.sessionContainer.jwtContainer)
                if (_res && request.sessionContainer.jwtContainer) {
                    if (_res.csrf) request.sessionContainer.jwtContainer.csrf = _res.csrf;
                }
                if (request.cacheContainer) {
                    if (!_res || !_res.do_not_cache_me)
                        request.cacheContainer.setKey(request.cacheKey, _res);
                }
                me.activeRequest = null;
                request.madeResolve(_res);
            }
        }, (_err) => {
            me.activeRequest = null;
            if (request) {
                me.resqueWrongRequest(request, _err);
            }
        }).catch((_err: any) => {
            me.activeRequest = null;
            if (request) {
                me.resqueWrongRequest(request, _err);
            }
        });
    }

    resqueWrongRequest(_request: FetchRequest, _err: any):void {
        let me = this;
        // console.log("One more time");
        if (_request && (_request.amountOfTries < _request.numOfRetriesBeforeReject)) {
            me.push(_request);
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate + 2000); //TODO: убрать хардкод с восстановления
        } else{
            // console.log("Прекращаем");
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate + 2000);
            if (_request.madeReject) _request.madeReject(_err);
        }
    }
}