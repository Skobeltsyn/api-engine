# Testing

api-engine ships a built-in test mock so consumer apps don't need MSW or `fetch` interceptors for unit tests.

## The mock surface

```ts
api.testFetch(value, ms);          // next fetch resolves with `value` after `ms` ms
api.testFetchAndFail(error, ms);   // next fetch rejects with `error` after `ms` ms
```

Both push onto a single LIFO; the next call to **any** fetch method pops one entry and uses it instead of going to the network. Covered fetch methods:

- `asyncFetch`
- `asyncFetchWithCache`
- `prioritizedAsyncFetchWithCache`
- `asyncFetchWithRetries`
- `asyncFetchWithoutQueing`
- `asyncFetchBlobWithoutQueing`

`corsFetch` is **not** mocked — it polls a CQRS ticket endpoint, so it issues two underlying fetches and the mock semantics don't fit.

## Vitest example

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ApiEngine, SessionContainer } from "api-engine";

class FakeUser { constructor(public raw: any) {} }

function buildEngine() {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    const session = new SessionContainer<FakeUser>(FakeUser, "/me");
    return new ApiEngine("https://example.test", 50, session);
}

describe("UserService.fetchProfile", () => {
    let api: ApiEngine;
    beforeEach(() => { api = buildEngine(); });

    it("returns the parsed user", async () => {
        api.testFetch({ id: "u1", name: "Alice" }, 0);
        const res = await api.asyncFetchWithoutQueing<any>("/me", {});
        expect(res).toEqual({ id: "u1", name: "Alice" });
    });

    it("propagates server errors", async () => {
        api.testFetchAndFail({ status: 500 }, 0);
        await expect(api.asyncFetchWithoutQueing<any>("/me", {})).rejects.toEqual({ status: 500 });
    });
});
```

## Order matters (LIFO)

Pushed entries are consumed in reverse order:

```ts
api.testFetch("first-pushed", 0);
api.testFetch("second-pushed", 0);
await api.asyncFetchWithoutQueing("/x", {}); // → "second-pushed"
await api.asyncFetchWithoutQueing("/y", {}); // → "first-pushed"
```

If your assertions depend on order, push the **last expected response first**.

## Without the queue

Tests for components that use `asyncFetchWithoutQueing` (one-shot reads, e.g. `useEffect`) don't need to call `startQueue()` — the no-queue methods short-circuit on `testFetches` before any queue interaction. This makes them especially useful in render-test scenarios where you don't want a global queue running.

## With the queue

If you do need the queued path, call `startQueue()` first:

```ts
api.startQueue();
api.testFetch({ ok: true }, 0);
await api.asyncFetch("/anything", {});
```

The mock still bypasses the actual queue dispatch, but `startQueue()` is needed because `asyncFetchWithRetries` checks `requestsQueue` and calls `whatsWrong()` if it's not initialized — *unless* the testFetches short-circuit fires first. The testFetches short-circuit runs first in the current code, so a missing queue is tolerated for mocked test paths. If you want to be explicit, just call `startQueue()`.

## Setting `csrf` to satisfy `JWTContainer`

`SessionContainer`'s constructor calls `JWTContainer.tryToRestoreJWT`, which throws if the `csrf` localStorage key is missing. Always seed it in your `beforeEach`:

```ts
beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
});
```

`"no csff"` (sic) is the placeholder string suggested by the library's own error message; any non-empty value works.
