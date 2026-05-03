import { describe, it, expect, beforeEach, vi } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser { constructor(public raw: any) {} }

function buildEngine(): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    return new ApiEngine("https://example.test", 50, new SessionContainer<FakeUser>(FakeUser, "/me"));
}

function stubFetchOk(body: unknown): ReturnType<typeof vi.fn> {
    const fn = vi.fn(async () => new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fn);
    return fn;
}

describe("transformResponse hook", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("transforms the resolved value seen by the caller", async () => {
        stubFetchOk({ data: { id: 1, name: "Alice" } });
        const api = buildEngine();
        api.hooks.transformResponse = (res) => res.data;

        const result = await api.asyncFetchWithoutQueing<any>("/users/1", {});
        expect(result).toEqual({ id: 1, name: "Alice" });
    });

    it("awaits an async hook", async () => {
        stubFetchOk({ data: 42 });
        const api = buildEngine();
        api.hooks.transformResponse = async (res) => {
            await new Promise((r) => setTimeout(r, 10));
            return res.data * 2;
        };

        const result = await api.asyncFetchWithoutQueing<any>("/x", {});
        expect(result).toBe(84);
    });

    it("does not run on cache hit", async () => {
        const fetchSpy = stubFetchOk({ data: "fresh" });
        const api = buildEngine();
        api.startQueue();

        let calls = 0;
        api.hooks.transformResponse = (res) => {
            calls += 1;
            return res.data;
        };

        // First call: network → transform runs.
        const first = await api.asyncFetchWithCache<any>("/cached", {});
        expect(first).toBe("fresh");
        expect(calls).toBe(1);

        // Second call: cache hit → transform must not run.
        const second = await api.asyncFetchWithCache<any>("/cached", {});
        expect(second).toBe("fresh"); // already-transformed value sits in cache
        expect(calls).toBe(1);
    });

    it("propagates errors from the hook", async () => {
        stubFetchOk({ data: "x" });
        const api = buildEngine();
        api.hooks.transformResponse = () => { throw new Error("transform-boom"); };

        await expect(
            api.asyncFetchWithoutQueing<any>("/x", {})
        ).rejects.toThrow("transform-boom");
    });
});
