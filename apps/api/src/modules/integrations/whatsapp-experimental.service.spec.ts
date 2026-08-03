import { describe, expect, it } from "vitest";
import {
  isWithinWhatsAppWindow,
  normalizeWhatsAppPhone,
} from "./whatsapp-experimental.service";

describe("WhatsApp experimental safeguards", () => {
  it("normalizes only phone numbers with a bounded length", () => {
    expect(normalizeWhatsAppPhone("+55 (11) 99999-0000")).toBe("5511999990000");
    expect(normalizeWhatsAppPhone("123")).toBeNull();
    expect(normalizeWhatsAppPhone("5511999990000000")).toBeNull();
  });

  it("enforces the configured messaging window in the configured timezone", () => {
    const midday = new Date("2026-08-02T15:00:00.000Z");
    const night = new Date("2026-08-02T02:00:00.000Z");
    const settings = {
      timezone: "America/Sao_Paulo",
      allowedFrom: "08:00",
      allowedUntil: "20:00",
    };
    expect(isWithinWhatsAppWindow(settings, midday)).toBe(true);
    expect(isWithinWhatsAppWindow(settings, night)).toBe(false);
  });

  it("rejects malformed windows instead of sending", () => {
    expect(isWithinWhatsAppWindow({ allowedFrom: "not-a-time" })).toBe(false);
    expect(isWithinWhatsAppWindow({ timezone: "invalid/timezone" })).toBe(false);
  });
});
