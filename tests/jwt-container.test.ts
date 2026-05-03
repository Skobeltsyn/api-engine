import { describe, it, expect, beforeEach } from "vitest";
import JWTContainer from "../src/models/JWTContainer";

describe("JWTContainer", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("round-trips via localStorage when constructed", () => {
        const jwt = new JWTContainer("token-abc", "csrf-xyz");
        jwt.writeToLocalStorage();
        expect(localStorage.getItem("jwt")).toBe("token-abc");
        expect(localStorage.getItem("csrf")).toBe("csrf-xyz");
    });

    it("tryToRestoreJWT returns null when jwt is missing", () => {
        localStorage.setItem("csrf", "csrf-only");
        expect(JWTContainer.tryToRestoreJWT()).toBeNull();
    });

    it("tryToRestoreJWT throws Error when csrf is missing", () => {
        localStorage.setItem("jwt", "jwt-only");
        expect(() => JWTContainer.tryToRestoreJWT()).toThrow(Error);
    });

    it("tryToRestoreJWT returns container when both are present", () => {
        localStorage.setItem("jwt", "abc");
        localStorage.setItem("csrf", "xyz");
        const restored = JWTContainer.tryToRestoreJWT();
        expect(restored).not.toBeNull();
        expect(restored!.content).toBe("abc");
        expect(restored!.csrf).toBe("xyz");
    });
});
