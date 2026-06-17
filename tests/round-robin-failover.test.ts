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

function ok(body: unknown = {}): Response {
    return new Response(JSON.stringify(body), {
        status: 200, headers: { "Content-Type": "application/json" },
    });
}
function serverErr(): Response {
    return new Response(JSON.stringify({ error: "boom" }), {
        status: 503, headers: { "Content-Type": "application/json" },
    });
}
function originOf(input: any): string {
    return new URL(String(input)).origin;
}

describe("round-robin failover", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("rotates the starting server across requests (wrapping)", async () => {
        const hits: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: any) => { hits.push(originOf(url)); return ok(); }));

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.roundRobin = true;

        await api.asyncFetchWithoutQueing("/a", {});
        await api.asyncFetchWithoutQueing("/b", {});
        await api.asyncFetchWithoutQueing("/c", {});
        await api.asyncFetchWithoutQueing("/d", {});

        expect(hits).toEqual([S1, S2, S3, S1]);
    });

    it("keeps fixed-order (always S1) when roundRobin is off — back-compat with #4558", async () => {
        const hits: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: any) => { hits.push(originOf(url)); return ok(); }));

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        // roundRobin defaults to false

        await api.asyncFetchWithoutQueing("/a", {});
        await api.asyncFetchWithoutQueing("/b", {});
        await api.asyncFetchWithoutQueing("/c", {});

        expect(hits).toEqual([S1, S1, S1]);
    });

    it("does not re-probe a dead server when rotation moves past it", async () => {
        const hits: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: any) => {
            hits.push(originOf(url));
            return originOf(url) === S1 ? serverErr() : ok();   // S1 permanently dead
        }));

        const api = buildEngine();
        api.servers = [S1, S2];
        api.roundRobin = true;
        api.serverFailoverAttempts = 1;

        await api.asyncFetchWithoutQueing("/a", {});  // start S1 (dead) -> failover S2
        await api.asyncFetchWithoutQueing("/b", {});  // start S2 (ok) -> S1 never touched

        // S1 is hit exactly once (only the first request fronts it), not on every request.
        expect(hits).toEqual([S1, S2, S2]);
    });

    it("wraps around the ring on failover from a rotated start", async () => {
        const hits: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: any) => {
            hits.push(originOf(url));
            return originOf(url) === S1 ? ok({ data: "from-s1" }) : serverErr(); // only S1 healthy
        }));

        const api = buildEngine();
        api.servers = [S1, S2, S3];
        api.roundRobin = true;
        api.serverFailoverAttempts = 1;

        // req1 starts at S1 (healthy) -> single hit, advances cursor to S2
        const r1 = await api.asyncFetchWithoutQueing<any>("/a", {});
        expect(r1).toEqual({ data: "from-s1" });

        // req2 starts at S2 (dead) -> S3 (dead) -> wraps to S1 (healthy)
        const r2 = await api.asyncFetchWithoutQueing<any>("/b", {});
        expect(r2).toEqual({ data: "from-s1" });

        expect(hits).toEqual([S1, S2, S3, S1]);
    });
});
