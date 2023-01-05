import FetchRequest from "./FetchRequest";
import ApiEngine from "../ApiEngine";

export default class RequestsQueue {
    private requestsFetchingRate: number;
    private requests: FetchRequest[];
    private requestsNumber: number;
    private active: boolean;
    private timeoutForUpdate: ReturnType<typeof setTimeout> | undefined;
    private apiEngine: ApiEngine;

    constructor(_requestsFetchingRate: number, _api: ApiEngine) {
        this.requests = [];
        this.requestsNumber = 0;
        this.requestsFetchingRate = _requestsFetchingRate;
        this.active = false;
        this.apiEngine = _api;
        this.processRequest = this.processRequest.bind(this);
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
        let request = me.requests.shift();

        if (request === undefined || request === null) {
            clearTimeout(this.timeoutForUpdate);
            this.timeoutForUpdate = setTimeout(() => { me.processRequest.bind(me); me.processRequest(); }, me.requestsFetchingRate);
            return;
        }
        me.requestsNumber += 1;
            request.perform().then((_res) => {
                if (request !== undefined && request.madeResolve) {
                    clearTimeout(me.timeoutForUpdate);
                    me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
                    // if (me.chatApp.sessionContainer.jwtContainer)
                    if (request.sessionContainer.jwtContainer) {
                        if (_res.csrf) request.sessionContainer.jwtContainer.csrf = _res.csrf;
                    }
                    if (request.cacheContainer) {
                        if (!_res.do_not_cache_me)
                            request.cacheContainer.setKey(request.cacheKey, _res);
                    }
                    request.madeResolve(_res);
                }
            }, (_err) => {
                if (request) me.resqueWrongRequest(request, _err);
            }).catch((_err: any) => {
                if (request) me.resqueWrongRequest(request, _err);
            });
    }

    resqueWrongRequest(_request: FetchRequest, _err: any):void {
        let me = this;
        // console.log("One more time");
        if (_request && (_request.amountOfTries < _request.numOfRetriesBeforeReject)) {
            me.push(_request);
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
        } else{
            // console.log("Прекращаем");
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
            if (_request.madeReject) _request.madeReject(_err);
        }
    }
}