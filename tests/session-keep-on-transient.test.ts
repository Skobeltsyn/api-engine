import { describe, it, expect, beforeEach, vi } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser { constructor(public raw: any) {} }

function buildSession() {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    localStorage.setItem("jwt", "tok-123");
    const session = new SessionContainer<FakeUser>(FakeUser, "/me");
    const revokeSpy = vi.fn();
    // Override the instance method so we observe revocation without jsdom navigation.
    session.jwtContainer!.revoke = revokeSpy;
    const api = new ApiEngine("https://example.test", 50, session);
    return { session, api, revokeSpy };
}

function resp(status: number): Response {
    return new Response(JSON.stringify({ e: status }), {
        status, headers: { "Content-Type": "application/json" },
    });
}

describe("SessionContainer keeps session on transient errors", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("does NOT revoke on a 5xx (transient) failure", async () => {
        const { session, api, revokeSpy } = buildSession();
        api.testFetchAndFail(resp(503), 1);
        await expect(session.checkUser()).rejects.toBeTruthy();
        expect(revokeSpy).not.toHaveBeenCalled();
        expect(session.jwtContainer).not.toBeNull();
    });

    it("does NOT revoke on a network Error (transient) failure", async () => {
        const { session, api, revokeSpy } = buildSession();
        api.testFetchAndFail(new TypeError("network down"), 1);
        await expect(session.checkUser()).rejects.toBeTruthy();
        expect(revokeSpy).not.toHaveBeenCalled();
    });

    it("DOES revoke on a 401 (auth) failure — existing behavior preserved", async () => {
        const { session, api, revokeSpy } = buildSession();
        api.testFetchAndFail(resp(401), 1);
        await expect(session.checkUser()).rejects.toBeTruthy();
        expect(revokeSpy).toHaveBeenCalledTimes(1);
    });

    it("revokeOnTransientError=true revokes on 5xx too", async () => {
        const { session, api, revokeSpy } = buildSession();
        session.revokeOnTransientError = true;
        api.testFetchAndFail(resp(503), 1);
        await expect(session.checkUser()).rejects.toBeTruthy();
        expect(revokeSpy).toHaveBeenCalledTimes(1);
    });
});
