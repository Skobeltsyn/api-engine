# Changelog

All notable changes to api-engine are tracked in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is roughly semver-with-pre-1.0-allowance.

## [Unreleased]

### Added
- `ApiEngineError` class with stable `code` field (`queue_not_initialized`, `url_invalid`, `cqrs_timeout`, `queue_full`, `cancelled`). Exported from the package barrel.
- `ApiEngine.debug` boolean. When `false` (the default), library trace logs are silenced.
- Optional `AbortSignal` parameter on every fetch method. Aborted requests reject with `ApiEngineError("cancelled")`.
- Generic response type `<T = any>` on all fetch methods, e.g. `apiEngine.asyncFetch<User>("/me", {})`.
- `CQRSCommand` accepts `maxPollAttempts` and `timeoutMs` (defaults remain unbounded for backward compat).
- `RequestsQueue.maxSize` (default `Infinity`) — over-cap pushes reject with `ApiEngineError("queue_full")`.
- `CacheContainer.maxEntries` (default `Infinity`) — insertion-order eviction on overflow.
- Lifecycle events on `ApiEngine`: `request_started`, `request_succeeded`, `request_retried`, `request_failed`. Subscribe via `apiEngine.on(event, handler)`.
- `WebsocketConnector.connectMessageBuilder` strategy for custom connect-message shapes.
- `SessionContainer.clearJwt()` for non-reload logout.
- `SessionContainer.revokeOnCheckUserFailure` flag (default `true`) lets consumers disable the page reload on `checkUser` failure.
- Vitest test infrastructure (`vitest.config.ts`, `tests/`) plus initial coverage for `ApiEngineError`, `CacheContainer`, `JWTContainer`, the test-mock surface, and URL validation.
- JSDoc on all public methods.
- `CHANGELOG.md` (this file).

### Changed
- `FetchRequest.data` typed as `RequestInit` instead of `any`.
- `whatsWrong()` now rejects with `ApiEngineError`, not a Russian-language string.
- Malformed URLs in fetch methods now reject the returned promise instead of throwing synchronously.
- `testFetches` is now `TestFetch[]` internally; public surface unchanged.

## [0.0.801] — 2026-05-03

### Fixed
- `testFetchAndFail` now rejects (was using `resolve: true`, behaving identically to `testFetch`).
- `corsFetch` propagates `CQRSCommand` rejection instead of hanging forever.
- `CQRSCommand.getResult` polling failures reject the parent `makeRequest` promise.
- `RequestsQueue.processRequest` null-guards the response before reading `csrf` / `do_not_cache_me`.
- `FetchRequest.perform` increments `amountOfTries` exactly once per attempt (was double-counting and halving the retry budget).
- `RequestsQueue.start` is idempotent — clearing pending timeout prevents parallel processing loops.
- `mode: 'cors'` moved from headers (where it was ignored) to RequestInit (where it belongs).
- `JWTContainer.tryToRestoreJWT` throws `Error` instead of a bare string.
- `WebsocketConnector` clears `pingInterval` before reassigning to prevent leaks on re-entry.
- `testFetches` mock now also short-circuits `asyncFetchWithoutQueing` and `asyncFetchBlobWithoutQueing` (was only honored on the queued path).
- Build script uses `&&` (sequential) instead of `&` (parallel), with cross-platform `rimraf`/`shx`.
- Removed deprecated `tsc` runtime dependency.
- Removed dead `.bind()` no-op in `processRequest`.

### Added
- `SessionContainer.clearJwt()` for non-reload logout.
- `CQRSCommand` exported from `index.ts`.
- `generateContentTypeData` correctly spelled; typo'd `generateContentTypetData` kept as a deprecated alias.
