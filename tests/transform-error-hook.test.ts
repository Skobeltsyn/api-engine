import { describe, it, expect, beforeEach, vi } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser { constructor(public raw: any) {} }

function buildEngine(): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    return new ApiEngine("https://example.test", 50, new SessionContainer<FakeUser>(FakeUser, "/me"));
}

describe("transformError hook", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("transforms a Response rejection into a normalized shape", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(
            JSON.stringify({ error: "not_found" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
        )));
        const api = buildEngine();
        api.hooks.transformError = async (err) => {
            if (err instanceof Response) {
                return { kind: "http", status: err.status, body: await err.json() };
            }
            return err;
        };

        try {
            await api.asyncFetchWithoutQueing<any>("/x", {});
            throw new Error("should have rejected");
        } catch (e: any) {
            expect(e).toEqual({ kind: "http", status: 404, body: { error: "not_found" } });
        }
    });

    it("transforms a native Error rejection", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("net down"); }));
        const api = buildEngine();
        api.hooks.transformError = (err) => {
            return { kind: "network", message: (err as Error).message };
        };

        await expect(
            api.asyncFetchWithoutQueing<any>("/x", {})
        ).rejects.toEqual({ kind: "network", message: "net down" });
    });

    it("awaits an async hook", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
        const api = buildEngine();
        api.hooks.transformError = async (err) => {
            await new Promise((r) => setTimeout(r, 10));
            return { kind: "wrapped", original: (err as Error).message };
        };

        await expect(
            api.asyncFetchWithoutQueing<any>("/x", {})
        ).rejects.toEqual({ kind: "wrapped", original: "boom" });
    });
});
