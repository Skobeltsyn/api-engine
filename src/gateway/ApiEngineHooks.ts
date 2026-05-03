/**
 * Pluggable hooks for ApiEngine. Each is optional; assign on the engine
 * instance (e.g. `apiEngine.beforeRequest = ...`).
 */
export default interface ApiEngineHooks {
    /**
     * Runs after auth headers are attached but before native fetch.
     * - Mutate the passed RequestInit and return void to keep it.
     * - Or return a new RequestInit to replace.
     * - May be async; the result is awaited.
     * - Throwing rejects the fetch promise.
     */
    beforeRequest?: (req: RequestInit, url: URL) => RequestInit | void | Promise<RequestInit | void>;

    /**
     * Runs on a successful response. Return value replaces the resolved
     * value seen by the caller; may be async.
     */
    transformResponse?: (res: any, req: RequestInit) => any | Promise<any>;

    /**
     * Runs on rejection. Return value replaces the rejection reason; may
     * be async. Useful for normalizing Response/Error/ApiEngineError into
     * a consistent shape.
     */
    transformError?: (err: unknown) => unknown | Promise<unknown>;

    /**
     * Runs when fetch returns 401. Use to refresh the auth token. After
     * the returned promise resolves, the original request is retried once.
     * If the retry also yields 401, the second 401 is propagated as-is —
     * no infinite refresh loop.
     */
    onAuthFailure?: (req: RequestInit, response: Response) => void | Promise<void>;
}
