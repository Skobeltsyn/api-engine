import SessionContainer from "../../session/SessionContainer";

export default class FetchRequest {
    url: URL;
    data: any;
    amountOfTries: number;
    sessionContainer: SessionContainer<any>;
    madeResolve?: (value: (PromiseLike<unknown> | unknown)) => void;
    madeReject?: (value: (PromiseLike<unknown> | unknown)) => void;

    constructor(_url: URL, _data: any, _sessionContainer: SessionContainer<any>) {
        this.url = _url;
        this.data = _data;
        this.sessionContainer = _sessionContainer;
        this.amountOfTries = 0;

        this.generateHeadersWithAuthorization = this.generateHeadersWithAuthorization.bind(this);
    }

    generateHeaders():HeadersInit {
        return this.generateHeadersWithAuthorization();
    }

    generateContentTypetData() {
        let result = "application/json";
        if (this.data.body && this.data.body.constructor === FormData) {
            result = "multipart/form-data";
            return null;
        }
        return result;
    }
    generateAnonymousHeaders() {
        let headers = {
            'Accept': 'application/json',
            "mode": 'cors',
        } as any;
        let contentType = this.generateContentTypetData();
        if (contentType) {
            headers['Content-Type'] = this.generateContentTypetData();
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
                'Accept': 'application/json',
                "mode": 'cors'
            } as any;
        } else {
            headers = {
                'Accept': 'application/json',
                "mode": 'cors',
                "Authorization": jwtContainer.content,
                "csrf": jwtContainer.csrf
            } as any;
        }
        let contentType = this.generateContentTypetData();
        if (contentType) {
            headers['Content-Type'] = this.generateContentTypetData();
        }
        return headers;
    }

    perform():Promise<any> {
        let me = this;
        return new Promise((resolve, reject) => {
            me.amountOfTries += 1;
            let data = {... me.data};
            data.headers = this.generateHeaders();
            return fetch(this.url, data).then((e: Response) => {
                return e.json()
            }).then((_res) => {
                if (_res) {
                    if (me.sessionContainer.jwtContainer)
                        if (_res.csrf) me.sessionContainer.jwtContainer.csrf = _res.csrf;
                }
                resolve(_res);
            }).catch((e) => {
                me.amountOfTries += 1;
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