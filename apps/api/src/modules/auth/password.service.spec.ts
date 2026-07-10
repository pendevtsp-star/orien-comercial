import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  it("hashes and verifies passwords with a server-side pepper", async () => {
    const service = new PasswordService();
    const hash = await service.hashPassword("StrongPassword123!", "pepper-value");

    await expect(service.verifyPassword(hash, "StrongPassword123!", "pepper-value")).resolves.toBe(true);
    await expect(service.verifyPassword(hash, "StrongPassword123!", "other-pepper")).resolves.toBe(false);
  });
});
