import { describe, expect, it } from "vitest";
import { hashPassword, isPasswordHash, passwordProblem, verifyPassword } from "@/lib/server/auth/password";
import { hasRole } from "@/lib/server/auth/roles";
import { authSettings, signSession, verifySession, type AuthSettings } from "@/lib/server/auth/session";
import { outcomeOf } from "@/lib/server/outcomes";
import { maskPhone, scrubDigits } from "@/lib/server/privacy";
import { daysIn, parseRange } from "@/lib/server/schemas/query";
import { SignJWT } from "jose";

const SECRET = "x".repeat(40);

describe("privacy", () => {
  it("masks every phone format to the last four digits", () => {
    for (const phone of ["+917020547519", "917020547519", "07020547519", "+91 70205 47519"]) {
      expect(maskPhone(phone)).toBe("+91 ••••••7519");
    }
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("12")).toBeNull();
  });

  it("removes long digit runs from free text", () => {
    expect(scrubDigits("call me on 98220 12345 today")).toBe("call me on [number removed] today");
    expect(scrubDigits("आधार १२३४ ५६७८ ९०१२")).toBe("आधार [number removed]");
    expect(scrubDigits("E-100001 at 10:30")).toBe("E-100001 at 10:30");
  });
});

describe("outcomes", () => {
  it.each([
    [{ durationSec: 120, turnCounts: { citizen: 0 } }, "no_speech"],
    [{ durationSec: 120, turnCounts: { citizen: 1 } }, "short"],
    [{ durationSec: 20, turnCounts: { citizen: 5 } }, "short"],
    [{ durationSec: 25, turnCounts: { citizen: 2 } }, "completed"],
    [{}, "no_speech"],
  ])("%j is %s", (interaction, expected) => {
    expect(outcomeOf(interaction)).toBe(expected);
  });
});

describe("date ranges (India time)", () => {
  const now = new Date("2026-10-20T20:00:00Z"); // 21 Oct 01:30 IST

  it("defaults to the last 7 IST days including today", () => {
    const range = parseRange(new URLSearchParams(), now);
    expect([range.fromDay, range.toDay]).toEqual(["2026-10-15", "2026-10-21"]);
    expect(range.from.toISOString()).toBe("2026-10-14T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-21T18:30:00.000Z");
    expect(daysIn(range)).toHaveLength(7);
  });

  it.each([["from=2026-10-10&to=2026-10-01"], ["from=2026-02-30"], ["from=yesterday"], ["from=2026-01-01&to=2026-12-31"]])(
    "rejects %s",
    (query) => {
      expect(() => parseRange(new URLSearchParams(query), now)).toThrow();
    },
  );
});

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt:16384:8:1:[\w-]+:[\w-]+$/);
    expect(hash).not.toContain("$"); // Next.js would expand it inside .env
    expect(isPasswordHash(hash)).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong horse battery", hash)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it.each([
    ["Short1!", false],
    ["onlylowercasexy", false],
    ["lowercase1234", false],
    ["Lowercase1234", true],
    ["lowercase and 1234", true],
    ["Rakshak control 2026", true],
    ["पोलीस नियंत्रण कक्ष 2026!", true],
  ])("strength of %s: ok=%s", (password, ok) => {
    expect(passwordProblem(password) === null).toBe(ok);
  });
});

describe("sessions", () => {
  const settingsFor = async (password: string, secret = SECRET): Promise<AuthSettings> => ({
    passwordHash: await hashPassword(password),
    secret,
    name: "Police control room",
    sessionHours: 1,
  });

  it("issues a session for the control room account", async () => {
    const settings = await settingsFor("Rakshak control 2026");
    expect(await verifySession(await signSession(settings), settings)).toEqual({ id: "control-room", name: "Police control room", role: "admin" });
  });

  it("signs every session out when the password changes", async () => {
    const settings = await settingsFor("Rakshak control 2026");
    const token = await signSession(settings);
    expect(await verifySession(token, { ...settings, passwordHash: await hashPassword("New password 2027!") })).toBeNull();
  });

  it("rejects a wrong secret, a tampered or expired token, and no token", async () => {
    const settings = await settingsFor("Rakshak control 2026");
    const token = await signSession(settings);
    expect(await verifySession(token, { ...settings, secret: "y".repeat(40) })).toBeNull();
    const [h, p, s] = token.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, exp: claims.exp + 86400 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, settings)).toBeNull();
    const expired = await new SignJWT({ pv: claims.pv }).setProtectedHeader({ alg: "HS256" }).setSubject("control-room")
      .setIssuer("rakshak-dashboard").setAudience("rakshak-dashboard").setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(expired, settings)).toBeNull();
    expect(await verifySession(undefined, settings)).toBeNull();
  });

  it("reports missing settings by name", () => {
    expect(authSettings({})).toEqual({ missing: "DASHBOARD_PASSWORD_HASH" });
    expect(authSettings({ DASHBOARD_PASSWORD_HASH: "scrypt:1", DASHBOARD_JWT_SECRET: "short" })).toEqual({
      missing: "DASHBOARD_JWT_SECRET (at least 32 characters)",
    });
    expect(authSettings({ DASHBOARD_PASSWORD_HASH: "h", DASHBOARD_JWT_SECRET: SECRET })).toMatchObject({ name: "Police control room", sessionHours: 8 });
  });
});

describe("roles", () => {
  it("ranks admin > reviewer > viewer", () => {
    expect(hasRole("admin", "reviewer")).toBe(true);
    expect(hasRole("reviewer", "reviewer")).toBe(true);
    expect(hasRole("viewer", "reviewer")).toBe(false);
    expect(hasRole("reviewer", "admin")).toBe(false);
  });
});
