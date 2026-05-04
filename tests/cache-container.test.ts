import { describe, it, expect, beforeEach } from "vitest";
import CacheContainer from "../src/models/CacheContainer";

describe("CacheContainer", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("round-trips a value", () => {
        const cache = new CacheContainer("test_storage");
        cache.setKey("/users/1", { id: 1, name: "Alice" });
        expect(cache.getKey("/users/1")).toEqual({ id: 1, name: "Alice" });
    });

    it("returns null when storage is empty", () => {
        const cache = new CacheContainer("test_storage");
        expect(cache.getKey("/missing")).toBeNull();
    });

    it("returns undefined for a missing key in a non-empty cache", () => {
        const cache = new CacheContainer("test_storage");
        cache.setKey("/present", { x: 1 });
        expect(cache.getKey("/missing")).toBeUndefined();
    });

    it("ignores empty key in setKey", () => {
        const cache = new CacheContainer("test_storage");
        expect(cache.setKey(null, { x: 1 })).toBe(false);
        expect(cache.setKey("", { x: 1 })).toBe(false);
    });

    it("evicts oldest entries when maxEntries is set", () => {
        const cache = new CacheContainer("test_storage");
        cache.maxEntries = 2;
        cache.setKey("a", 1);
        cache.setKey("b", 2);
        cache.setKey("c", 3);
        expect(cache.getKey("a")).toBeUndefined();
        expect(cache.getKey("b")).toBe(2);
        expect(cache.getKey("c")).toBe(3);
    });

    it("does not evict on overwrite of existing key", () => {
        const cache = new CacheContainer("test_storage");
        cache.maxEntries = 2;
        cache.setKey("a", 1);
        cache.setKey("b", 2);
        cache.setKey("a", 99);
        expect(cache.getKey("a")).toBe(99);
        expect(cache.getKey("b")).toBe(2);
    });
});
