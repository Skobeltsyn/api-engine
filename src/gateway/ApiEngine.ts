import FetchRequest from "./fetch_requests/FetchRequest";
import RequestsQueue from "./fetch_requests/RequestsQueue";
import SessionContainer from "../session/SessionContainer";

export default class ApiEngine {
    private requestsFetchingRate: number;
    requestsQueue?: RequestsQueue;
    serverUrl: string;
    sessionContainer: SessionContainer<any>;

    constructor(_serverUrl: string, _requestsFetchingRate: number, _sessionContainer: SessionContainer<any>) {
        this.serverUrl = _serverUrl;
        this.requestsFetchingRate = _requestsFetchingRate;
        this.sessionContainer = _sessionContainer;
        this.sessionContainer.apiEngine = this;
        this.startQueue = this.startQueue.bind(this);
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
        return this.asyncFetchWithRetries(_url, _dataToSend, 5);
    }

    asyncFetchWithRetries(_url:string, _dataToSend: any, _numOfRetriesBeforeReject: number) {
        let me = this;
        let url = new URL(`${me.serverUrl}/${_url}`);
        if (!me.requestsQueue) return me.whatsWrong();
        let request = new FetchRequest(url, _dataToSend, this.sessionContainer, _numOfRetriesBeforeReject);
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