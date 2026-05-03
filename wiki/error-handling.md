# Error handling

api-engine has a small, predictable error surface:

- **`ApiEngineError`** for things the library itself detects (bad URL, queue not started, CQRS timeout, queue full, cancelled).
- **`Response`** objects for non-2xx HTTP responses (re-thrown as-is from `fetch`).
- **Whatever your server returned** for explicit failure responses (objects you decide to reject with).

## ApiEngineError codes

```ts
import { ApiEngineError } from "api-engine";

try {
    await api.asyncFetch("/anything", {});
} catch (e) {
    if (e instanceof ApiEngineError) {
        switch (e.code) {
            case "queue_not_initialized": /* call api.startQueue() */ break;
            case "url_invalid":           /* check serverUrl */ break;
            case "queue_full":            /* back off, raise maxSize, etc. */ break;
            case "cqrs_timeout":          /* retry the long-running command */ break;
            case "cancelled":             /* user navigated away — fine, ignore */ break;
        }
    }
}
```

| Code | When it fires |
|---|---|
| `queue_not_initialized` | A queued fetch was issued before `startQueue()`. |
| `url_invalid`           | `new URL()` failed for the composed URL. |
| `cqrs_timeout`          | `CQRSCommand` exceeded `maxPollAttempts` or `timeoutMs`. |
| `queue_full`            | `RequestsQueue.push` rejected because `maxSize` was hit. |
| `cancelled`             | The `AbortSignal` you passed was triggered. |

Everything else is rejection from `fetch` itself or from the server payload.

## Cancellation

```ts
const ctrl = new AbortController();
const promise = api.asyncFetch("/long", {}, ctrl.signal);
ctrl.abort();
// promise rejects with ApiEngineError("cancelled", ...)
```

Cancellation is honored at two points:
1. Before queue dispatch — if `signal.aborted` is true when the queue picks the request up, it's rejected without ever calling `fetch`.
2. During `fetch` — the signal is forwarded to native `fetch`, which throws an `AbortError` (which the library re-rejects as-is).

## Retries

`asyncFetchWithRetries(url, init, retries, cache, priority, signal?)` — the `retries` parameter is the retry budget (max attempts). After exhaustion the original error is propagated.

`asyncFetch` defaults to 5 attempts; `asyncFetchWithoutQueing` defaults to 0 (no retries). Failures emit `request_retried` events as long as the budget isn't exhausted, then a final `request_failed`.

## Lifecycle events

```ts
api.on("request_started",   ({ url, attempt }) => loaderStart(url, attempt));
api.on("request_succeeded", ({ url, attempt }) => loaderEnd(url));
api.on("request_retried",   ({ url, attempt, error }) => warn(url, error));
api.on("request_failed",    ({ url, attempt, error }) => report(url, error));
```

Handler exceptions are swallowed by `emit` so a buggy listener can't break the queue.

## Network-vs-application errors

`FetchRequest.perform` rejects in both cases:
- network error → the `Error` from `fetch().catch`
- non-2xx response → the `Response` object itself (so you can `.json()` it for an error body)

Distinguish them by `e instanceof Response`:

```ts
catch (e) {
    if (e instanceof Response) {
        const body = await e.json();
        // application-level error
    } else if (e instanceof ApiEngineError) {
        // library-level
    } else {
        // network / native fetch error
    }
}
```
