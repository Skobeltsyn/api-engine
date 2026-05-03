/**
 * Stable error codes thrown by api-engine. Consumers can switch on these
 * without parsing message strings.
 */
export type ApiEngineErrorCode =
    | "queue_not_initialized"
    | "url_invalid"
    | "cqrs_timeout"
    | "queue_full"
    | "cancelled";

/**
 * Error subclass used by api-engine. Carries a `code` field with one of
 * the {@link ApiEngineErrorCode} values.
 */
export default class ApiEngineError extends Error {
    readonly code: ApiEngineErrorCode;

    constructor(code: ApiEngineErrorCode, message: string) {
        super(message);
        this.name = "ApiEngineError";
        this.code = code;
        Object.setPrototypeOf(this, ApiEngineError.prototype);
    }
}
