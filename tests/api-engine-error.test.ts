import { describe, it, expect } from "vitest";
import ApiEngineError from "../src/models/ApiEngineError";

describe("ApiEngineError", () => {
    it("is instanceof Error", () => {
        const e = new ApiEngineError("queue_not_initialized", "boom");
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(ApiEngineError);
    });

    it("carries a stable code field", () => {
        const e = new ApiEngineError("url_invalid", "bad");
        expect(e.code).toBe("url_invalid");
        expect(e.message).toBe("bad");
        expect(e.name).toBe("ApiEngineError");
    });
});
