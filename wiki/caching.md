# Caching

api-engine ships a small `CacheContainer` for memoizing GET-style responses. It's not a sophisticated cache — no TTL, no per-key invalidation strategies — but it's enough for "load this config once, keep it across reloads."

## Defaults

```ts
api.cacheContainer instanceof CacheContainer; // true
api.cacheContainer.persistent;                 // true → uses localStorage
api.cacheContainer.maxEntries;                 // Infinity by default
```

The default storage key is `default_api_storage_storage` (yes, two underscores; the suffix comes from `getStorageKey()`).

## Reading and writing

`asyncFetchWithCache` does it for you:

```ts
const settings = await api.asyncFetchWithCache<Settings>("/settings", {});
// First call → network. Subsequent calls → cached value.
```

Behind the scenes:
- Cache key = the relative `_url` you passed (e.g. `"/settings"`).
- On a hit, the engine resolves immediately with the cached value.
- On a miss, the engine fetches, then stores the response under the same key.

Direct use:

```ts
api.cacheContainer.setKey("/settings", { theme: "dark" });
api.cacheContainer.getKey("/settings"); // → { theme: "dark" }
```

## Skipping cache for individual responses

The queue checks for `_res.do_not_cache_me` on a successful response. If your server returns:

```json
{ "items": [...], "do_not_cache_me": true }
```

…the engine will not store it. Useful for endpoints whose responses are mostly cacheable but occasionally aren't (e.g. partial results during background loading).

## Invalidating an entry

Because there's no per-key delete:

```ts
api.cacheContainer.setKey("/settings", undefined);
// or if you want a real delete, mutate via localStorage:
const raw = JSON.parse(localStorage.getItem("default_api_storage_storage") || "{}");
delete raw["/settings"];
localStorage.setItem("default_api_storage_storage", JSON.stringify(raw));
```

## Bounding cache size

For long-running apps, set `maxEntries`:

```ts
api.cacheContainer.maxEntries = 500;
```

When `setKey` would push the entry count past the cap, the oldest entries (insertion order) are dropped. This is approximate-LRU — not true LRU since reads don't bump position. Good enough to bound memory; not a substitute for real cache governance.

## Performance notes

The current implementation reads + JSON.parses the entire blob on every `getKey`/`setKey`. For small caches (<100 KB) this is sub-millisecond. For long-running SPAs that accumulate megabytes, this becomes noticeable on the main thread — consider:

- Setting `maxEntries` to bound size
- Using a separate `CacheContainer` per concern (different `storageName`) so each blob stays small
- Replacing `CacheContainer` entirely (it's a public class — subclass and assign to `apiEngine.cacheContainer`)

## In-memory only

If you don't want localStorage:

```ts
api.cacheContainer.persistent = false;
```

The cache then lives in `quickStorage` (a stringified JSON blob in memory) and is gone on reload.
