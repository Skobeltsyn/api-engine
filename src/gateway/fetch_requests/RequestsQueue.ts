import FetchRequest from "./FetchRequest";
import ApiEngine from "../ApiEngine";
import { log } from "../../util/Log";
import ApiEngineError from "../../models/ApiEngineError";

export default class RequestsQueue {
    private requestsFetchingRate: number;
    private requests: FetchRequest[];
    private requestsNumber: number;
    private active: boolean;
    private timeoutForUpdate: ReturnType<typeof setTimeout> | undefined;
    private apiEngine: ApiEngine;
    private activeRequest: FetchRequest | null;
    public maxSize: number = Infinity;

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
        if (this.requests.length >= this.maxSize) {
            if (_req.madeReject) {
                _req.madeReject(new ApiEngineError(
                    "queue_full",
                    `Queue is full (maxSize=${this.maxSize}); rejecting new request.`
                ));
            }
            return;
        }
        this.requests.push(_req);
    }

    start() {
        if (this.timeoutForUpdate) clearTimeout(this.timeoutForUpdate);
        this.active = true;
        this.timeoutForUpdate = setTimeout(this.processRequest, 100);
        log("Queue started");
    }

    stop() {
        log("Stopping Queue");
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
            this.timeoutForUpdate = setTimeout(() => { me.processRequest(); }, me.requestsFetchingRate);
            return;
        }
        if (request.signal?.aborted) {
            if (request.madeReject) request.madeReject(new ApiEngineError("cancelled", "Request aborted before dispatch."));
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
            return;
        }
        me.requestsNumber += 1;
        me.activeRequest = request;
        const cacheKeyForEvent = request.cacheKey || String(request.url);
        me.apiEngine.emit("request_started", { url: cacheKeyForEvent, attempt: request.amountOfTries + 1 });
        request.perform().then((_res) => {
            if (request !== null && request !== undefined && request.madeResolve) {
                clearTimeout(me.timeoutForUpdate);
                me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate);
                if (_res && request.sessionContainer.jwtContainer) {
                    if (_res.csrf) request.sessionContainer.jwtContainer.csrf = _res.csrf;
                }
                if (request.cacheContainer) {
                    if (!_res || !_res.do_not_cache_me)
                        request.cacheContainer.setKey(request.cacheKey, _res);
                }
                me.activeRequest = null;
                me.apiEngine.emit("request_succeeded", { url: cacheKeyForEvent, attempt: request.amountOfTries });
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
        const url = _request.cacheKey || String(_request.url);
        if (_request && (_request.amountOfTries < _request.numOfRetriesBeforeReject)) {
            me.apiEngine.emit("request_retried", { url, attempt: _request.amountOfTries, error: _err });
            me.push(_request);
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate + 2000);
        } else{
            clearTimeout(me.timeoutForUpdate);
            me.timeoutForUpdate = setTimeout(me.processRequest, me.requestsFetchingRate + 2000);
            me.apiEngine.emit("request_failed", { url, attempt: _request.amountOfTries, error: _err });
            if (_request.madeReject) _request.madeReject(_err);
        }
    }
}