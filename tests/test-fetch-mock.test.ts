import { describe, it, expect, beforeEach } from "vitest";
import ApiEngine from "../src/gateway/ApiEngine";
import SessionContainer from "../src/session/SessionContainer";

class FakeUser {
    constructor(public raw: any) {}
}

function makeEngine(): ApiEngine {
    localStorage.clear();
    localStorage.setItem("csrf", "no csff");
    const session = new SessionContainer<FakeUser>(FakeUser, "/me");
    return new ApiEngine("https://example.test", 50, session);
}

describe("test-fetch mock", () => {
    let engine: ApiEngine;
    beforeEach(() => {
        engine = makeEngine();
    });

    it("testFetch resolves on asyncFetchWithoutQueing", async () => {
        engine.testFetch({ ok: true, value: 42 }, 5);
        const res = await engine.asyncFetchWithoutQueing<any>("/anything", {});
        expect(res).toEqual({ ok: true, value: 42 });
    });

    it("testFetchAndFail rejects on asyncFetchWithoutQueing", async () => {
        engine.testFetchAndFail({ message: "boom" }, 5);
        await expect(
            engine.asyncFetchWithoutQueing<any>("/anything", {})
        ).rejects.toEqual({ message: "boom" });
    });

    it("testFetchAndFail rejects on asyncFetchBlobWithoutQueing", async () => {
        engine.testFetchAndFail("err", 5);
        await expect(
            engine.asyncFetchBlobWithoutQueing<any>("/file", {})
        ).rejects.toBe("err");
    });

    it("uses each pushed test fetch exactly once (LIFO)", async () => {
        engine.testFetch("first-pushed", 1);
        engine.testFetch("second-pushed", 1);
        const a = await engine.asyncFetchWithoutQueing<any>("/x", {});
        const b = await engine.asyncFetchWithoutQueing<any>("/y", {});
        expect(a).toBe("second-pushed");
        expect(b).toBe("first-pushed");
    });
});
