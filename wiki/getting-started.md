# Getting started

This page walks through wiring api-engine into a new app from zero.

## Install

```bash
npm install api-engine
```

## Three concepts

api-engine has three objects you'll touch on day one:

| Object | Role |
|---|---|
| `ApiEngine` | Issues HTTP calls; owns the queue, cache, and websocket connector. |
| `SessionContainer` | Holds the current user, the JWT, and the CSRF token. |
| `JWTContainer` | Reads/writes the JWT and CSRF in `localStorage`. |

`ApiEngine` and `SessionContainer` reference each other. You hand the session to the engine in the constructor; the engine assigns itself to `session.apiEngine`.

## Minimal app

```ts
import { ApiEngine, SessionContainer } from "api-engine";

class User {
    id!: string;
    name!: string;
    constructor(raw: any) { Object.assign(this, raw); }
}

const session = new SessionContainer<User>(User, "/api/me");
const api = new ApiEngine("https://example.com/api", 100, session);

// Required: start the queue before issuing requests.
api.startQueue();

// Plain fetch:
const order = await api.asyncFetch<{ id: string }>("/orders/42", { method: "GET" });

// Fetch with caching (localStorage by default):
const settings = await api.asyncFetchWithCache<Settings>("/settings", {});

// POST:
await api.asyncFetch("/orders", {
    method: "POST",
    body: JSON.stringify({ total: 100 }),
});
```

## CSRF requirement on first run

`SessionContainer`'s constructor calls `JWTContainer.tryToRestoreJWT`, which **throws** if the `csrf` localStorage key is missing entirely (it allows a present-but-empty value). Two options:

1. Seed it on app boot before constructing `SessionContainer`:
   ```ts
   if (!localStorage.getItem("csrf")) localStorage.setItem("csrf", "no csff");
   ```
2. Or wrap `SessionContainer` construction in try/catch and seed on failure.

This is intentional but unusual; expect to do this once per app.

## Next

- [API reference](api-reference.md)
- [Caching](caching.md)
- [Testing](testing.md)
- [Error handling](error-handling.md)
