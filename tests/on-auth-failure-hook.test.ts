import { describe, it, expect, beforeEach, vi } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser { constructor(public raw: any) {} }

function buildEngine(): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    return new ApiEngine("https://example.test", 50, new SessionContainer<FakeUser>(FakeUser, "/me"));
}

function unauthorized(): Response {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
    });
}

function ok(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

describe("onAuthFailure hook", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("fires the hook on 401 and retries once with success", async () => {
        const responses = [unauthorized(), ok({ data: "after-refresh" })];
        const fetchSpy = vi.fn(async () => responses.shift()!);
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        const hookCalls: any[] = [];
        api.hooks.onAuthFailure = async (_req, _res) => {
            hookCalls.push({ status: _res.status });
            // Pretend we refreshed the token.
        };

        const result = await api.asyncFetchWithoutQueing<any>("/protected", {});
        expect(result).toEqual({ data: "after-refresh" });
        expect(hookCalls).toHaveLength(1);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("does not loop on a second 401 — second fires once and propagates", async () => {
        const fetchSpy = vi.fn(async () => unauthorized());
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        let hookCalls = 0;
        api.hooks.onAuthFailure = async () => { hookCalls += 1; };

        await expect(
            api.asyncFetchWithoutQueing<any>("/protected", {})
        ).rejects.toBeInstanceOf(Response);
        expect(hookCalls).toBe(1);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("propagates a hook error without retrying", async () => {
        const fetchSpy = vi.fn(async () => unauthorized());
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.hooks.onAuthFailure = async () => {
            throw new Error("refresh failed");
        };

        await expect(
            api.asyncFetchWithoutQueing<any>("/protected", {})
        ).rejects.toThrow("refresh failed");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("rejects normally on 401 when no hook is installed", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => unauthorized()));
        const api = buildEngine();

        await expect(
            api.asyncFetchWithoutQueing<any>("/protected", {})
        ).rejects.toBeInstanceOf(Response);
    });
});
