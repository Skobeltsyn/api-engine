export type ApiEngineErrorCode =
    | "queue_not_initialized"
    | "url_invalid"
    | "cqrs_timeout"
    | "queue_full"
    | "cancelled";

export default class ApiEngineError extends Error {
    readonly code: ApiEngineErrorCode;

    constructor(code: ApiEngineErrorCode, message: string) {
        super(message);
        this.name = "ApiEngineError";
        this.code = code;
        Object.setPrototypeOf(this, ApiEngineError.prototype);
    }
}
