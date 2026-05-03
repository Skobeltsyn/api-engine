# API reference

Every public method on the exported classes. For deeper context see the per-topic pages.

## `ApiEngine`

### Constructor
```ts
new ApiEngine(serverUrl: string, requestsFetchingRate: number, session: SessionContainer<any>)
```
- `serverUrl` — base URL prepended to relative paths
- `requestsFetchingRate` — minimum delay between queued requests (ms)
- `session` — owns JWT/CSRF/current user

### Queue lifecycle
- `startQueue(): void` — start (or restart) the request queue. Must be called before queued fetches.
- `cleanQueue(): void` — drop all pending entries; the active request is rejected.
- `requestsQueue?: RequestsQueue` — direct access to the queue (for `maxSize`, etc.).

### Fetch methods
All return `Promise<T>` (default `T = any`) and accept an optional final `signal?: AbortSignal`.

| Method | Description |
|---|---|
| `asyncFetch<T>(url, init, signal?)` | Queued fetch with 5 retries; no cache. |
| `asyncFetchWithCache<T>(url, init, signal?)` | Like above; checks cache first, caches success. |
| `prioritizedAsyncFetchWithCache<T>(url, init, priority, signal?)` | Cached fetch with explicit queue priority. |
| `asyncFetchWithRetries<T>(url, init, retries, cache, priority, signal?)` | Lower-level entry point. |
| `asyncFetchWithoutQueing<T>(url, init, retries?, signal?)` | Bypasses the queue. Useful for one-shot reads. |
| `asyncFetchBlobWithoutQueing<T>(url, init, retries?, signal?)` | Same, but parses the response as a `Blob`. |
| `corsFetch<T>(command, params, isBlob, sendUrl, ticketCheckEndpoint, updateCallback?)` | CQRS: post a command, poll for result. |

### Test mock
- `testFetch(value, ms): void` — next fetch resolves with `value` after `ms`.
- `testFetchAndFail(err, ms): void` — next fetch rejects with `err` after `ms`.
Both push onto the same LIFO; the next fetch (any variant) pops one.

### Events
```ts
type ApiEngineEvent = "request_started" | "request_succeeded" | "request_retried" | "request_failed";
type ApiEngineEventPayload = { url: string; attempt: number; error?: unknown };
```
- `on(event, handler)` — subscribe
- `off(event, handler)` — unsubscribe
- `emit(event, payload)` — emit (used internally; safe to call manually too)

### Misc
- `debug: boolean` — when `true`, library trace logs go to `console.log`.
- `canUseOutsideLinks: boolean` — when `true`, absolute URLs (`https://…`) are used as-is instead of being relative-rewritten.
- `cacheContainer: CacheContainer` — current cache.
- `websocketConnector: WebsocketConnector` — current WS connector (defaults to `NullWebsocketConnector`).
- `updateToken(token): void` — convenience that delegates to `session.updateToken`.
- `whatsWrong(): Promise<never>` — returns a rejected promise describing why the engine is unusable.

## `SessionContainer<UserClass>`

- `constructor(userClassAsObject: any, meUrl: string)` — `userClassAsObject` is a constructor that takes the raw `me` payload.
- `currentUser: UserClass | null`
- `currentEntity: UserClass` — throws if no user; useful when the user *must* exist.
- `jwtContainer: JWTContainer | null | undefined`
- `checkUser(): Promise<UserClass>` — validates JWT, populates `currentUser`. On failure calls `jwtContainer.revoke()` if `revokeOnCheckUserFailure` is true (default).
- `revokeOnCheckUserFailure: boolean` — flip to `false` for SPA-friendly soft failure.
- `clearJwt(): void` — clear jwt/csrf in localStorage and reset the in-memory session.
- `refresh(): void` — re-read JWT from localStorage.
- `updateToken(token): void` — write a new JWT.
- `apiEngine: ApiEngine` — back-reference (engine sets this in its own constructor).

## `JWTContainer`

- `constructor(content: string, csrf: string)` — also writes to localStorage.
- `content: string` — the JWT (read-only).
- `csrf: string` — the CSRF token; setter persists.
- `static tryToRestoreJWT(): JWTContainer | null` — read from localStorage; throws if csrf key missing.
- `writeToLocalStorage(): void`
- `revoke(): void` — clear both keys and **reload the page** (use `SessionContainer.clearJwt()` for non-reload logout).

## `CacheContainer`

- `constructor(storageName: string)` — controls the localStorage key.
- `persistent: boolean` (default `true`) — `false` = in-memory only.
- `maxEntries: number` (default `Infinity`) — insertion-order eviction.
- `getKey(key): any` — `null`/`undefined` on miss.
- `setKey(key, value): boolean` — false if key is empty.

## `RequestsQueue`

- `maxSize: number` (default `Infinity`) — over-cap pushes reject with `ApiEngineError("queue_full")`.
- `start(): void` / `stop(): void` — lifecycle.
- `clean(): void` — drop pending; reject the active request.

## `WebsocketConnector`

- `constructor(url: string, api: ApiEngine)`
- `connectMessageBuilder?: () => unknown` — optional strategy for the connect handshake payload.
- `initWebsocket(): void`
- `hangupWebSocket(): void`
- `sendMessage(content: string): boolean`

`NullWebsocketConnector` is a no-op subclass used as the default; replace via `apiEngine.websocketConnector = new WebsocketConnector(...)` if you need WS.

## `CQRSCommand`

Used internally by `ApiEngine.corsFetch`; exposed for direct use.

- `constructor(command, params, isBlob, url, api, callPeriod?, ticketCheckEndpoint?, updateCallback?, options?)`
- `options.maxPollAttempts?: number` (default `Infinity`)
- `options.timeoutMs?: number` (default `Infinity`)
- `static fromJSON(json, api)` / `static fromJSONString(s, api)`
- `id: string | null` — server-assigned ticket id once the command is posted.
- `makeRequest(): Promise<any>`

## `ApiEngineError`

- `code: ApiEngineErrorCode` — one of `"queue_not_initialized" | "url_invalid" | "cqrs_timeout" | "queue_full" | "cancelled"`.
- Standard `Error` interface (`message`, `name = "ApiEngineError"`, stack).
