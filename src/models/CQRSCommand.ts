import ApiEngine from "../gateway/ApiEngine";
import { log } from "../util/Log";
import ApiEngineError from "./ApiEngineError";

export interface CQRSCommandOptions {
  callPeriod?: number;
  ticketCheckEndpoint?: string;
  updateCallback?: (_res: string) => void;
  maxPollAttempts?: number;
  timeoutMs?: number;
}

export default class CQRSCommand {
  private updateCallback: undefined | ((_res: string) => void);
  private _command: string;
  private _params: any;
  private api: ApiEngine;
  private _callPeriod: number = 1000;
  private _ticketId: string | null = null;
  private isBlob: boolean = false;
  private ticketCheckEndpoint: string = "/cqrs";
  private url: string;
  private maxPollAttempts: number = Infinity;
  private timeoutMs: number = Infinity;
  private pollAttempts: number = 0;
  private pollStartedAt: number = 0;

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
              _ticketCheckEndpoint: string = "/cqrs",
              _updateCallback: undefined | ((_res: string) => void) = undefined,
              _options: { maxPollAttempts?: number; timeoutMs?: number } = {}
              ) {
    this.api = _api;
    this._command = _command;
    this._params = _params;
    this.url = _url;
    this._callPeriod = _callPeriod;
    this.isBlob = _isBlob;
    this.ticketCheckEndpoint = _ticketCheckEndpoint;
    this.updateCallback = _updateCallback;
    if (_options.maxPollAttempts !== undefined) this.maxPollAttempts = _options.maxPollAttempts;
    if (_options.timeoutMs !== undefined) this.timeoutMs = _options.timeoutMs;

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
    if (me.pollStartedAt === 0) me.pollStartedAt = Date.now();
    me.pollAttempts += 1;

    if (me.pollAttempts > me.maxPollAttempts) {
      me.madeReject && me.madeReject(new ApiEngineError(
        "cqrs_timeout",
        `CQRS polling exhausted maxPollAttempts (${me.maxPollAttempts}) for ticket ${me._ticketId}.`
      ));
      return;
    }
    if ((Date.now() - me.pollStartedAt) > me.timeoutMs) {
      me.madeReject && me.madeReject(new ApiEngineError(
        "cqrs_timeout",
        `CQRS polling exceeded timeoutMs (${me.timeoutMs}) for ticket ${me._ticketId}.`
      ));
      return;
    }

    let cqrsQuery = {
      method: "POST",
      body: JSON.stringify({
        ticketId: me._ticketId
      })
    }
    let method = me.api.asyncFetch;

    method(me.ticketCheckEndpoint, cqrsQuery).then((_e: any) => {
      log(_e);
      if (_e.status === "выполнено") {
        me.madeResolve && me.madeResolve(_e.result);
      } else {
        setTimeout(() => {
          if (me.updateCallback) {
            me.updateCallback(_e.status);
          }
          me.getResult();
        }, me._callPeriod);
      }
    }, (_err: any) => {
      me.madeReject && me.madeReject(_err);
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