# api-engine

A small, opinionated HTTP client for browser apps. Built as an alternative to axios when you want a single FIFO queue, built-in retries, optional response caching, JWT/CSRF management, WebSocket dispatch, and a CQRS poll-until-done helper — all in one place.

If you've ever wanted to *throttle* requests so you don't hammer your own server (or your own UI), api-engine's queue is the point of the whole thing.

---

## Install

```bash
npm install api-engine
```

## Quick start

```ts
import { ApiEngine, SessionContainer } from "api-engine";

class User {
    id!: string;
    constructor(raw: any) { Object.assign(this, raw); }
}

// 1. Build a session and an engine.
const session = new SessionContainer<User>(User, "/api/me");
const api = new ApiEngine("https://example.com/api", 100 /* ms between requests */, session);

// 2. Start the queue. (Mandatory — fetch methods reject if you forget.)
api.startQueue();

// 3. Fire requests.
const me = await api.asyncFetch<User>("/me", { method: "GET" });

// 4. Cached fetch:
const config = await api.asyncFetchWithCache<{ flags: string[] }>("/config", {});
```

## Why use it?

- **Built-in request queue.** All queued fetches go through one FIFO with a configurable inter-request delay. Useful for protecting weak endpoints and avoiding UI thrash.
- **Retries with priority.** `asyncFetchWithRetries` takes a retry budget and a priority value; higher-priority requests jump the queue.
- **Response caching.** `asyncFetchWithCache` reads from `CacheContainer` (localStorage by default) before going to the network. Optional `maxEntries` cap with insertion-order eviction.
- **JWT + CSRF.** Tokens persist in `localStorage` and are attached automatically via `SessionContainer` / `JWTContainer`.
- **AbortSignal.** Pass an `AbortSignal` to any fetch method; in-flight requests cancel cleanly.
- **Lifecycle events.** Subscribe to `request_started`, `request_succeeded`, `request_retried`, `request_failed`.
- **Test mock built-in.** `apiEngine.testFetch(value, ms)` and `testFetchAndFail(err, ms)` push stubbed responses popped by the next call — no MSW required for unit tests.
- **CQRS helper.** `corsFetch` posts a command and polls a ticket endpoint until it reports completion (with optional max-attempts and timeout).
- **WebSocket dispatcher.** `WebsocketConnector` reconnects automatically and republishes server messages as `CustomEvent`s on `document`.

## Common patterns

### Cancel an in-flight request

```ts
const controller = new AbortController();
const promise = api.asyncFetch("/long-running", {}, controller.signal);
// later, e.g. on unmount:
controller.abort();
```

### Listen for queue activity

```ts
api.on("request_started", ({ url, attempt }) => {
    console.log(`[api] → ${url} (attempt ${attempt})`);
});
api.on("request_failed", ({ url, error }) => {
    reportToTelemetry(url, error);
});
```

### Type your responses

```ts
interface Order { id: string; total: number; }
const order = await api.asyncFetch<Order>("/orders/42", {});
//    ^ Order
```

### Catch typed errors

```ts
import { ApiEngineError } from "api-engine";

try {
    await api.asyncFetch("/missing", {});
} catch (e) {
    if (e instanceof ApiEngineError && e.code === "url_invalid") {
        // handle malformed URL specifically
    }
}
```

### Mock fetches in tests

```ts
api.testFetch({ users: [] }, 0);          // next fetch resolves with this
api.testFetchAndFail("nope", 0);          // next fetch rejects with this
const res = await api.asyncFetchWithoutQueing("/users", {});
expect(res).toEqual({ users: [] });
```

### Cap memory in long-running apps

```ts
api.requestsQueue!.maxSize = 200;            // reject pushes over 200 pending
api.cacheContainer.maxEntries = 500;         // LRU-evict oldest cache entries
```

## Documentation

- [`/wiki/getting-started.md`](wiki/getting-started.md)
- [`/wiki/api-reference.md`](wiki/api-reference.md)
- [`/wiki/caching.md`](wiki/caching.md)
- [`/wiki/websockets.md`](wiki/websockets.md)
- [`/wiki/testing.md`](wiki/testing.md)
- [`/wiki/error-handling.md`](wiki/error-handling.md)
- [`/wiki/migration.md`](wiki/migration.md)
- [`CHANGELOG.md`](CHANGELOG.md)

## Debug

```ts
api.debug = true;        // turns on library trace logs (console.log)
```

Errors always go to `console.error` regardless of this flag.

## License

MIT — see [LICENSE](LICENSE).
