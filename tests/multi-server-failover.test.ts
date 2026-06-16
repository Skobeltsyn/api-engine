import { describe, it, expect, beforeEach, vi } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser { constructor(public raw: any) {} }

const S1 = "https://s1.test";
const S2 = "https://s2.test";
const S3 = "https://s3.test";

function buildEngine(): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    return new ApiEngine(S1, 50, new SessionContainer<FakeUser>(FakeUser, "/me"));
}

function serverErr(): Response {
    return new Response(JSON.stringify({ error: "boom" }), {
        status: 503, headers: { "Content-Type": "application/json" },
    });
}
function notFound(): Response {
    return new Response(JSON.stringify({ error: "nope" }), {
        status: 404, headers: { "Content-Type": "application/json" },
    });
}
function ok(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200, headers: { "Content-Type": "application/json" },
    });
}
function originOf(input: any): string {
    return new URL(String(input)).origin;
}

describe("multi-server failover", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("fails over to the next server after n critical failures", async () => {
        const hits: string[] = [];
        const fetchSpy = vi.fn(async (url: any) => {
            hits.push(originOf(url));
            return originOf(url) === S2 ? ok({ data: "from-s2" }) : serverErr();
        });
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.serverFailoverAttempts = 2;

        const result = await api.asyncFetchWithoutQueing<any>("/thing", {});
        expect(result).toEqual({ data: "from-s2" });
        // s1 twice (n=2), then s2 succeeds on first try
        expect(hits).toEqual([S1, S1, S2]);
    });

    it("throws all_servers_failed when every server is critical", async () => {
        const hits: string[] = [];
        const fetchSpy = vi.fn(async (url: any) => { hits.push(originOf(url)); return serverErr(); });
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.serverFailoverAttempts = 2;

        await expect(api.asyncFetchWithoutQueing<any>("/thing", {}))
            .rejects.toMatchObject({ code: "all_servers_failed" });
        expect(hits).toEqual([S1, S1, S2, S2, S3, S3]);
    });

    it("does NOT fail over on a non-critical (404) error", async () => {
        const hits: string[] = [];
        const fetchSpy = vi.fn(async (url: any) => { hits.push(originOf(url)); return notFound(); });
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.serverFailoverAttempts = 2;

        await expect(api.asyncFetchWithoutQueing<any>("/thing", {}))
            .rejects.toBeInstanceOf(Response);
        expect(hits).toEqual([S1]);
    });

    it("treats a thrown network error as critical and fails over", async () => {
        const hits: string[] = [];
        const fetchSpy = vi.fn(async (url: any) => {
            hits.push(originOf(url));
            if (originOf(url) === S1) throw new TypeError("network down");
            return ok({ data: "from-s2" });
        });
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.servers = [S1, S2];
        api.serverFailoverAttempts = 1;

        const result = await api.asyncFetchWithoutQueing<any>("/thing", {});
        expect(result).toEqual({ data: "from-s2" });
        expect(hits).toEqual([S1, S2]);
    });

    it("no failover when the first server succeeds", async () => {
        const hits: string[] = [];
        const fetchSpy = vi.fn(async (url: any) => { hits.push(originOf(url)); return ok({ ok: true }); });
        vi.stubGlobal("fetch", fetchSpy);

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.serverFailoverAttempts = 3;

        const result = await api.asyncFetchWithoutQueing<any>("/thing", {});
        expect(result).toEqual({ ok: true });
        expect(hits).toEqual([S1]);
    });
});
