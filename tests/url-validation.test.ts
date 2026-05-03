import { describe, it, expect, beforeEach } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import ApiEngineError from "../src/models/ApiEngineError";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser {
    constructor(public raw: any) {}
}

function makeEngine(serverUrl = "https://example.test"): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    return new ApiEngine(serverUrl, 50, new SessionContainer<FakeUser>(FakeUser, "/me"));
}

describe("URL validation", () => {
    it("rejects with ApiEngineError when serverUrl is malformed", async () => {
        const engine = makeEngine("not a url");
        await expect(
            engine.asyncFetchWithoutQueing<any>("/anything", {})
        ).rejects.toBeInstanceOf(ApiEngineError);
    });

    it("uses code 'url_invalid'", async () => {
        const engine = makeEngine("not a url");
        try {
            await engine.asyncFetchWithoutQueing<any>("/anything", {});
            throw new Error("should have rejected");
        } catch (e) {
            expect(e).toBeInstanceOf(ApiEngineError);
            expect((e as ApiEngineError).code).toBe("url_invalid");
        }
    });
});
