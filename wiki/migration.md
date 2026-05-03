# Migration

Notes on moving between versions. All releases through 1.0 aim to be backward-compatible; any breaking change will be called out here explicitly.

## Anything → 0.0.802 (current Unreleased)

All changes are additive. No code changes are required for existing consumers.

### New, opt-in surfaces

| Feature | How to adopt |
|---|---|
| `ApiEngineError` | Catch and check `e.code` instead of string-matching messages. |
| `debug` flag | `api.debug = true` to surface library trace logs. Default off. |
| `AbortSignal` | Pass `signal` as last arg to any fetch method. |
| Generic `<T>` | `api.asyncFetch<User>("/me", {})` instead of `as User` after the fact. |
| `CQRSCommand` bounds | Pass `{ maxPollAttempts, timeoutMs }` via the new constructor option. |
| Queue/cache caps | `api.requestsQueue!.maxSize = 200; api.cacheContainer.maxEntries = 500;` |
| Lifecycle events | `api.on("request_started", handler)`. |
| `connectMessageBuilder` | `api.websocketConnector.connectMessageBuilder = () => ({...})`. |
| `clearJwt()` | `session.clearJwt()` for non-reload logout. |
| `revokeOnCheckUserFailure` | `session.revokeOnCheckUserFailure = false` to suppress page reload on `checkUser` failure. |

### Renames and aliases

`FetchRequest.generateContentTypetData` (typo) is now an alias for `generateContentTypeData` (correct). The old name still works; migrate at your leisure.

### Behavior fixes worth knowing about

These are bugs that were silently wrong before. If your code depended on the wrong behavior, you'll see different (correct) behavior now.

- `testFetchAndFail` actually rejects (was resolving).
- `corsFetch` rejection is now propagated (was hanging forever on failure).
- `CQRSCommand.getResult` polling failures reject (were hanging).
- `FetchRequest.perform` increments `amountOfTries` once per call (was 2-3×; effective retry budget was previously ~half what you asked for).
- `RequestsQueue.start` clears any pending timeout before scheduling — calling `startQueue()` twice no longer creates parallel processing loops.
- Malformed URLs reject the promise (were throwing synchronously).
- `mode: 'cors'` moved from headers (where it was an invalid header) to RequestInit.
- `JWTContainer.tryToRestoreJWT` throws `Error` instead of a bare string.
- `RequestsQueue.processRequest` null-guards the response before reading `csrf`/`do_not_cache_me`.

### Build / packaging

- `tsc` is no longer a runtime dependency (it was a deprecated stub).
- `vitest`, `jsdom`, `@vitest/coverage-v8`, `rimraf`, `shx` are devDependencies.
- `package.json` build script uses `&&` for sequential execution and `shx`/`rimraf` for cross-platform support. Run `npm install` after upgrading.

## 0.0.787 → 0.0.801

See `CHANGELOG.md` and individual Redmine issues #919-#939 for the full set of bug fixes shipped in 0.0.801. None of them require consumer code changes.
