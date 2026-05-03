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

describe("beforeRequest hook", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("can mutate the request to add a custom header that reaches fetch", async () => {
        const fetchSpy = stubFetchOk({ ok: true });
        const api = buildEngine();
        api.beforeRequest = (req) => {
            const headers = new Headers(req.headers as HeadersInit);
            headers.set("X-Trace-Id", "abc-123");
            req.headers = headers;
        };
        await api.asyncFetchWithoutQueing("/anything", { method: "GET" });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const initArg = fetchSpy.mock.calls[0][1] as RequestInit;
        const sent = new Headers(initArg.headers as HeadersInit);
        expect(sent.get("X-Trace-Id")).toBe("abc-123");
    });

    it("can replace the request init by returning a new one", async () => {
        const fetchSpy = stubFetchOk({ ok: true });
        const api = buildEngine();
        api.beforeRequest = () => ({
            method: "POST",
            headers: { "X-Replaced": "yes" },
            body: "replaced-body",
        });
        await api.asyncFetchWithoutQueing("/anything", { method: "GET" });

        const initArg = fetchSpy.mock.calls[0][1] as RequestInit;
        expect(initArg.method).toBe("POST");
        expect(initArg.body).toBe("replaced-body");
        const sent = new Headers(initArg.headers as HeadersInit);
        expect(sent.get("X-Replaced")).toBe("yes");
    });

    it("awaits an async hook before dispatching", async () => {
        const fetchSpy = stubFetchOk({ ok: true });
        const api = buildEngine();
        const seenOrder: string[] = [];
        api.beforeRequest = async (req) => {
            await new Promise((r) => setTimeout(r, 10));
            seenOrder.push("hook-done");
            const headers = new Headers(req.headers as HeadersInit);
            headers.set("X-Async", "1");
            req.headers = headers;
        };

        const promise = api.asyncFetchWithoutQueing("/x", {});
        await promise;
        seenOrder.push("fetch-resolved");

        expect(seenOrder).toEqual(["hook-done", "fetch-resolved"]);
        const initArg = fetchSpy.mock.calls[0][1] as RequestInit;
        const sent = new Headers(initArg.headers as HeadersInit);
        expect(sent.get("X-Async")).toBe("1");
    });

    it("rejects the fetch promise when the hook throws", async () => {
        stubFetchOk({ ok: true });
        const api = buildEngine();
        api.beforeRequest = () => { throw new Error("hook-boom"); };

        await expect(
            api.asyncFetchWithoutQueing("/x", {})
        ).rejects.toThrow("hook-boom");
    });
});
