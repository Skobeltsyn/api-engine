import ApiEngine from "../gateway/ApiEngine";

export default class CQRSCommand {

  private _command: string;
  private _params: any;
  private api: ApiEngine;
  private _callPeriod: number = 1000;
  private _ticketId: string | null = null;
  private isBlob: boolean = false;
  private ticketCheckEndpoint: string = "/cqrs";
  private url: string;

  madeResolve?: (value: (PromiseLike<unknown> | unknown)) => void;
  madeReject?: (value: (PromiseLike<unknown> | unknown)) => void;

  get id(): string | null { return this._ticketId;}
  get params(): any { return this._params; }
  set params(value: any) { this._params = value;}
  get command(): string { return this._command; }
  set command(value: string) { this._command = value; }

  constructor(_command: string,
              _params: any,
              _isBlob: boolean,
              _url: string,
              _api: ApiEngine,
              _callPeriod: number = 1000,
              _ticketCheckEndpoint: string = "/cqrs") {
    this.api = _api;
    this._command = _command;
    this._params = _params;
    this.url = _url;
    this._callPeriod = _callPeriod;
    this.isBlob = _isBlob;
    this.ticketCheckEndpoint = _ticketCheckEndpoint;

    this.makeRequest = this.makeRequest.bind(this);
    this.getResult = this.getResult.bind(this);
  }

  static fromJSON(json: any, _api: ApiEngine): CQRSCommand {
    return new CQRSCommand(json.command, json.params, !!json.isBlob, json.url, _api);
  }

  static fromJSONString(json: string, _api: ApiEngine): CQRSCommand {
    return CQRSCommand.fromJSON(JSON.parse(json), _api);
  }

  getResult() {
    let me = this;
    let cqrsQuery = {
      method: "POST",
      body: JSON.stringify({
        ticketId: me._ticketId
      })
    }
    let method = me.api.asyncFetch;

    method(me.ticketCheckEndpoint, cqrsQuery).then((_e: any) => {
      console.log(_e);
      if (_e.status === "выполнено") {
        me.madeResolve && me.madeResolve(_e.result);
      } else {
        setTimeout(() => {
          me.getResult();
        }, me._callPeriod);
      }
    });
  }

  makeRequest():Promise<any> {
    let me = this;

    return new Promise((resolve, reject) => {
      me.api.asyncFetchWithoutQueing( me.url,
        {
          method: "POST",
          body: JSON.stringify({
            command: me.command,
            params: me.params
          })
        }).then((e: any) => {
        me._ticketId = e.ticket.id;

        me.madeResolve = resolve;
        me.madeReject = reject;

        me.getResult();

      }, (err: any) => {
        reject(err);
      });
    })
  }

}