import ApiEngineError from "../models/ApiEngineError";

/**
 * Classify an error as "critical" — i.e. transient/infrastructural and worth
 * failing over to another server (and worth keeping the session alive for) —
 * versus a definitive client/auth error that should be surfaced as-is.
 *
 * Critical (transient):
 *  - a thrown `Error`/`TypeError` from `fetch` (network down, DNS, CORS), or
 *  - a `Response` (or response-like object) with `status >= 500`.
 *
 * Not critical:
 *  - a `Response` with `status` 400–499 (incl. 401/403/404), or
 *  - any {@link ApiEngineError} (cancelled, url_invalid, queue_*).
 */
export function isCriticalError(err: unknown): boolean {
    // ApiEngineError is structured and intentional — never a transient blip.
    // (Checked before the generic Error branch since it subclasses Error.)
    if (err instanceof ApiEngineError) return false;
    if (typeof Response !== "undefined" && err instanceof Response) return err.status >= 500;
    if (err && typeof (err as any).status === "number") return (err as any).status >= 500;
    if (err instanceof Error) return true;
    return false;
}
