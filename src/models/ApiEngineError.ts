/**
 * Stable error codes thrown by api-engine. Consumers can switch on these
 * without parsing message strings.
 */
export type ApiEngineErrorCode =
    | "queue_not_initialized"
    | "url_invalid"
    | "cqrs_timeout"
    | "queue_full"
    | "cancelled"
    | "all_servers_failed";

/**
 * Error subclass used by api-engine. Carries a `code` field with one of
 * the {@link ApiEngineErrorCode} values, and an optional `cause` carrying the
 * underlying error (e.g. the last server failure behind `all_servers_failed`).
 */
export default class ApiEngineError extends Error {
    readonly code: ApiEngineErrorCode;
    readonly cause?: unknown;

    constructor(code: ApiEngineErrorCode, message: string, cause?: unknown) {
        super(message);
        this.name = "ApiEngineError";
        this.code = code;
        this.cause = cause;
        Object.setPrototypeOf(this, ApiEngineError.prototype);
    }
}
