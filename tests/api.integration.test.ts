/**
 * Admin API against a real MongoDB. Runs only when TEST_MONGODB_URI is set, e.g.:
 *
 *   mongod --dbpath /tmp/rakshak-test --port 27099 --fork --logpath /tmp/rakshak-test.log
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27099 npm test
 *
 * Each run uses a fresh throwaway database and drops it at the end.
 */
import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {}, // no Next.js request scope under Vitest
}));

const URI = process.env.TEST_MONGODB_URI;
const DB_NAME = `rakshak_test_${randomBytes(4).toString("hex")}`;
const PASSWORD = "Control room test 2026";
const EMAIL = "control@example.test";

let client: MongoClient;
let db: Db;
let cookie = "";

type Handler = (request: NextRequest, segment: { params: Promise<Record<string, string>> }) => Promise<Response>;

async function call(handler: Handler, as: "control" | null, path: string, init: { method?: string; body?: unknown; params?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (as) headers.cookie = cookie;
  const request = new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const response = await handler(request, { params: Promise.resolve(init.params ?? {}) });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

describe.skipIf(!URI)("admin API (MongoDB)", () => {
  // route modules are imported after the environment is set
  let routes: Record<string, Record<string, Handler>>;

  beforeAll(async () => {
    process.env.MONGODB_URI = URI;
    process.env.CITIZEN_DB = DB_NAME;
    process.env.DASHBOARD_JWT_SECRET = randomBytes(32).toString("hex");
    process.env.DASHBOARD_EMAIL = EMAIL;
    client = await new MongoClient(URI!).connect();
    db = client.db(DB_NAME);

    routes = {
      login: await import("@/app/api/auth/login/route"),
      me: await import("@/app/api/auth/me/route"),
      overview: await import("@/app/api/stats/overview/route"),
      languages: await import("@/app/api/stats/languages/route"),
      outcomes: await import("@/app/api/stats/outcomes/route"),
      timing: await import("@/app/api/stats/timing/route"),
      cases: await import("@/app/api/cases/route"),
      caseOne: await import("@/app/api/cases/[id]/route"),
      calls: await import("@/app/api/calls/route"),
      transcript: await import("@/app/api/calls/[id]/transcript/route"),
      callCaller: await import("@/app/api/calls/[id]/caller/route"),
      caseCaller: await import("@/app/api/cases/[id]/caller/route"),
      lostFound: await import("@/app/api/lost-found/route"),
      lostFoundStats: await import("@/app/api/lost-found/stats/route"),
      lostFoundOne: await import("@/app/api/lost-found/[id]/route"),
      lostFoundClose: await import("@/app/api/lost-found/[id]/close/route"),
      lostFoundCaller: await import("@/app/api/lost-found/[id]/caller/route"),
      audit: await import("@/app/api/audit/route"),
    } as unknown as Record<string, Record<string, Handler>>;

    // the control room account, as `npm run admin -- set-password` sets it up
    const { hashPassword } = await import("@/lib/server/auth/password");
    process.env.DASHBOARD_PASSWORD_HASH = await hashPassword(PASSWORD);
    const login = await call(routes.login.POST, null, "/api/auth/login", { method: "POST", body: { email: " Control@Example.test ", password: PASSWORD } });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Strict/);
    cookie = login.headers.get("set-cookie")!.split(";")[0];

    // bot data, shaped like citizen_store and case_store write it
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000);
    await db.collection("interactions").insertMany([
      { _id: "phone:a", citizenId: "+917020547519", channel: "phone", startedAt: at(60), endedAt: at(58), durationSec: 120, turnCounts: { citizen: 6, agent: 6, toolCalls: 1 }, toolsUsed: ["report_emergency"], status: "summarised", summary: { language: "marathi", clear: true, topics: ["theft"], summary: "Caller reported a theft." } },
      { _id: "phone:b", citizenId: "+919822012345", channel: "phone", startedAt: at(30), endedAt: at(29.9), durationSec: 8, turnCounts: { citizen: 1, agent: 1, toolCalls: 0 }, toolsUsed: [], status: "summarised", summary: { language: "english", clear: false, topics: [] } },
      { _id: "whatsapp:c", citizenId: "+919822054321", channel: "whatsapp", startedAt: at(10), endedAt: at(9), durationSec: 40, turnCounts: { citizen: 0, agent: 1, toolCalls: 0 }, toolsUsed: [], status: "pending" },
    ] as never[]);
    await db.collection("cases").insertOne({ _id: "E-100001", type: "emergency", status: "alerted", priority: "P1", priorityReason: "weapon involved", category: "weapon_attack", channel: "phone", interactionId: "phone:a", citizen: { phone: "+917020547519" }, location: { spoken: "सिन्नर बस स्टँड", english: "Sinnar bus stand" }, station: { name: "Sinnar PS", phone: "02551-000000" }, flags: { weapon: "yes" }, description: { mr: "चाकूने हल्ला, संपर्क 9822012345", asGiven: "" }, createdAt: at(59), updatedAt: at(59) } as never);
    // the bot's browser test page: never shown
    await db.collection("test_interactions").insertOne({ _id: "web:t1", citizenId: "+919999900000", channel: "web", startedAt: at(5), durationSec: 60, turnCounts: { citizen: 3 }, status: "summarised" } as never);
    await db.collection("test_cases").insertOne({ _id: "TE-100001", type: "emergency", status: "new", priority: "P1", category: "fire", citizen: { phone: "+919999900000" }, createdAt: at(5) } as never);
    await db.collection("transcripts").insertOne({ _id: "phone:a", citizenId: "+917020547519", startedAt: at(60), turns: [
      { role: "assistant", text: "नमस्कार, पोलीस मदत." },
      { role: "user", text: "चाकूने हल्ला झाला, नंबर [number removed]" },
      { role: "tool_call", tool: "report_emergency", arguments: "{\"place\":\"Sinnar\"}" },
    ] } as never);
    await db.collection("incidents").insertOne({ _id: "I-E-100001", caseIds: ["E-100001"], phones: ["+917020547519"], count: 1, area: "Sinnar PS", family: "violence", firstAt: at(59), lastAt: at(59) } as never);
    await db.collection("alerts").insertOne({ _id: "E-100001:alert:1", caseId: "E-100001", kind: "alert", status: "sent", to: "+919999999999", createdAt: at(59), sentAt: at(58.9) } as never);
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  it("rejects a wrong password, requests without a session, and locks out after 5 failures", async () => {
    const wrong = () => call(routes.login.POST, null, "/api/auth/login", { method: "POST", body: { email: EMAIL, password: "Wrong password 1" } });
    expect((await wrong()).status).toBe(401);
    // the right password with the wrong email fails the same way, without saying which was wrong
    const wrongEmail = await call(routes.login.POST, null, "/api/auth/login", { method: "POST", body: { email: "someone@example.test", password: PASSWORD } });
    expect(wrongEmail.status).toBe(401);
    expect(wrongEmail.body.error.message).toBe("That email and password don't match. Try again.");
    expect((await call(routes.login.POST, null, "/api/auth/login", { method: "POST", body: { password: PASSWORD } })).status).toBe(422);
    expect((await call(routes.overview.GET, null, "/api/stats/overview")).status).toBe(401);
    expect((await call(routes.me.GET, "control", "/api/auth/me")).body.account).toEqual({ name: "Police control room", email: EMAIL, role: "admin" });
    for (let i = 0; i < 3; i++) await wrong();
    const locked = await call(routes.login.POST, null, "/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
    expect(locked.status).toBe(429);
    const { resetLoginLimiter } = await import("@/lib/server/auth/login");
    resetLoginLimiter();
  });

  it("signs the session out when the password hash changes", async () => {
    const original = process.env.DASHBOARD_PASSWORD_HASH;
    const { hashPassword } = await import("@/lib/server/auth/password");
    process.env.DASHBOARD_PASSWORD_HASH = await hashPassword("Another password 2027");
    expect((await call(routes.me.GET, "control", "/api/auth/me")).status).toBe(401);
    process.env.DASHBOARD_PASSWORD_HASH = original;
    expect((await call(routes.me.GET, "control", "/api/auth/me")).status).toBe(200);
  });

  it("aggregates stats without identifying data", async () => {
    const overview = await call(routes.overview.GET, "control", "/api/stats/overview");
    expect(overview.body.totals).toMatchObject({ calls: 3, uniqueCallers: 3, emergencies: 1, emergenciesP1: 1, outcomes: { completed: 1, short: 1, no_speech: 1 } });
    expect(overview.body.perDay).toHaveLength(7);
    expect(overview.body.processing).toEqual({ pending: 1, failed: 0 });
    expect(overview.body.totals.alertsSent).toBe(1);
    expect(overview.body.perDay.reduce((sum: number, d: { alertsSent: number }) => sum + d.alertsSent, 0)).toBe(1);

    const languages = await call(routes.languages.GET, "control", "/api/stats/languages");
    expect(languages.body.languages.find((l: { language: string }) => l.language === "marathi")).toMatchObject({ calls: 1, clearRate: 1 });

    const outcomes = await call(routes.outcomes.GET, "control", "/api/stats/outcomes");
    expect(outcomes.body.emergencies.byCategory[0]).toMatchObject({ code: "weapon_attack", mr: "शस्त्राने हल्ला", count: 1 });
    expect(outcomes.body.topics).toEqual([{ key: "theft", count: 1 }]);

    const timing = await call(routes.timing.GET, "control", "/api/stats/timing");
    expect(timing.body.alertDelaySec.count).toBe(1);

    const everything = JSON.stringify([overview.body, languages.body, outcomes.body, timing.body]);
    expect(everything).not.toMatch(/7020547519|9822012345|9822054321|Caller reported/);
  });

  it("never shows the bot's test page traffic", async () => {
    const overview = await call(routes.overview.GET, "control", "/api/stats/overview");
    expect(overview.body.totals.calls).toBe(3);
    const cases = await call(routes.cases.GET, "control", "/api/cases?env=test");
    expect(cases.body.items.map((c: { id: string }) => c.id)).toEqual(["E-100001"]);
    const calls = await call(routes.calls.GET, "control", "/api/calls");
    expect(calls.body.items.map((c: { id: string }) => c.id)).not.toContain("web:t1");
  });

  it("lists calls and cases masked, without transcripts or recipients", async () => {
    const calls = await call(routes.calls.GET, "control", "/api/calls?outcome=short");
    expect(calls.body.items.map((c: { id: string }) => c.id)).toEqual(["phone:b"]);
    expect(calls.body.items[0].caller).toBe("+91 ••••••2345");
    expect(calls.body.items[0].cases).toEqual([]);
    const all = await call(routes.calls.GET, "control", "/api/calls");
    expect(all.body.items.find((c: { id: string }) => c.id === "phone:a")).toMatchObject({ summary: "Caller reported a theft.", cases: [{ id: "E-100001", priority: "P1" }] });

    const list = await call(routes.cases.GET, "control", "/api/cases?priority=P1");
    expect(list.body.items[0]).toMatchObject({ id: "E-100001", caller: "+91 ••••••7519", station: "Sinnar PS", callId: "phone:a", summary: "चाकूने हल्ला, संपर्क [number removed]" });

    const one = await call(routes.caseOne.GET, "control", "/api/cases/E-100001", { params: { id: "E-100001" } });
    expect(one.body.description.mr).toBe("चाकूने हल्ला, संपर्क [number removed]");
    const text = JSON.stringify(one.body);
    expect(text).not.toMatch(/7020547519|9999999999|9822012345/);
  });

  it("reveals a caller's number and shows a transcript only on request, auditing each", async () => {
    const caseNumber = await call(routes.caseCaller.POST, "control", "/api/cases/E-100001/caller", { method: "POST", params: { id: "E-100001" } });
    expect(caseNumber.body).toEqual({ phone: "+917020547519" });
    const callNumber = await call(routes.callCaller.POST, "control", "/api/calls/phone%3Ab/caller", { method: "POST", params: { id: "phone%3Ab" } });
    expect(callNumber.body).toEqual({ phone: "+919822012345" });
    const transcript = await call(routes.transcript.GET, "control", "/api/calls/phone%3Aa/transcript", { params: { id: "phone%3Aa" } });
    expect(transcript.body).toMatchObject({ available: true, turns: [
      { speaker: "bot", text: "नमस्कार, पोलीस मदत." },
      { speaker: "caller", text: "चाकूने हल्ला झाला, नंबर [number removed]" },
      { speaker: "tool", text: "report_emergency" },
    ] });
    expect(JSON.stringify(transcript.body)).not.toContain("Sinnar"); // tool arguments stay out
    expect((await call(routes.transcript.GET, "control", "/api/calls/x/transcript", { params: { id: "whatsapp:c" } })).body.available).toBe(false);
    const actions = (await db.collection("dash_audit_log").find({}).toArray()).map((a) => `${a.action} ${a.target}`);
    expect(actions).toEqual(expect.arrayContaining([
      "case.caller.reveal case:E-100001",
      "call.caller.reveal call:phone:b",
      "call.transcript.view call:phone:a",
    ]));
  });

  it("acknowledges a case the way the bot's CLI does, and audits it", async () => {
    const result = await call(routes.caseOne.PATCH, "control", "/api/cases/E-100001", { method: "PATCH", params: { id: "E-100001" }, body: { action: "status", status: "acknowledged", note: "patrol sent" } });
    expect(result.status).toBe(200);
    expect(result.body.status).toBe("acknowledged");
    const event = await db.collection("case_events").findOne({ caseId: "E-100001", kind: "acknowledged" });
    expect(event).toMatchObject({ by: "Police control room", data: { note: "patrol sent" } });
    const verdict = await call(routes.caseOne.PATCH, "control", "/api/cases/E-100001", { method: "PATCH", params: { id: "E-100001" }, body: { action: "verdict", verdict: "maybe" } });
    expect(verdict.status).toBe(422);
    const audit = await db.collection("dash_audit_log").findOne({ action: "case.acknowledged" });
    expect(audit).toMatchObject({ userName: "Police control room", before: { status: "alerted" }, after: { status: "acknowledged" } });
  });

  describe("lost and found", () => {
    beforeAll(async () => {
      const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000);
      const item = (id: string, kind: string, group: string, state: string, minutesAgo: number, status = "alerted") => ({
        _id: id, type: "lost_found", status, priority: "P4", category: group, interactionId: `phone:${id}`,
        citizen: { phone: "+917020547519" }, station: { name: "Sinnar Police Station", phone: "02551-220033", officer: "PI Patil" },
        description: { mr: "काळा फोन", asGiven: "black phone" },
        lostFound: { kind, state, group, item: "Redmi Note", colour: "black", marks: "cracked screen", imei: "861234567890123", itemPhone: "+919822000000" },
        createdAt: at(minutesAgo), updatedAt: at(minutesAgo),
      });
      await db.collection("cases").insertMany([
        item("L-100001", "lost", "phone", "open", 30),
        item("F-100001", "found", "phone", "open", 20),
        item("L-100002", "lost", "wallet", "returned", 60 * 24 * 3),
        item("F-100002", "found", "jewellery", "open", 10, "closed"),
      ] as never[]);
      const match = { kind: "match_suggested", by: "system", data: { lost: "L-100001", found: "F-100001", score: 97, strong: true } };
      await db.collection("case_events").insertMany([
        { caseId: "L-100001", at: at(19), ...match },
        { caseId: "F-100001", at: at(19), ...match },
      ] as never[]);
      // the test page's lost and found: never shown
      await db.collection("test_cases").insertOne({ ...item("TL-100001", "lost", "phone", "open", 5) } as never);
    });

    it("counts reports, open items and matches to check", async () => {
      const stats = await call(routes.lostFoundStats.GET, "control", "/api/lost-found/stats");
      expect(stats.body).toMatchObject({
        reported: { lost: 2, found: 2 },
        open: { lost: 1, found: 1 },
        matchesToCheck: 1,
        strongMatchesToCheck: 1,
        resolved: 2,
      });
      expect(stats.body.perDay).toHaveLength(7);
    });

    it("lists status and matches, never item details or numbers", async () => {
      const open = await call(routes.lostFound.GET, "control", "/api/lost-found?open=true");
      expect(open.body.items.map((r: { id: string }) => r.id)).toEqual(["F-100001", "L-100001"]);
      expect(open.body.items[1]).toEqual({
        id: "L-100001", kind: "lost", item: "phone", state: "open", caseStatus: "alerted", station: "Sinnar Police Station",
        match: { with: "F-100001", score: 97, strong: true }, reportedAt: expect.any(String), updatedAt: expect.any(String),
      });
      const found = await call(routes.lostFound.GET, "control", "/api/lost-found?kind=found");
      expect(found.body.items.map((r: { id: string }) => r.id)).toEqual(["F-100002", "F-100001"]);
      const all = await call(routes.lostFound.GET, "control", "/api/lost-found");
      expect(all.body.items).toHaveLength(4);
      expect(JSON.stringify([open.body, found.body, all.body])).not.toMatch(/Redmi|black|cracked|8612345|9822000000|7020547519|02551|Patil|काळा|TL-100001/);
    });

    it("shows one report's details and its call, but not the number or IMEI on the item", async () => {
      const one = await call(routes.lostFoundOne.GET, "control", "/api/lost-found/L-100001", { params: { id: "L-100001" } });
      expect(one.body).toMatchObject({
        id: "L-100001", kind: "lost", open: true, caller: "+91 ••••••7519",
        item: { name: "Redmi Note", group: "phone", colour: "black", marks: "cracked screen" },
        station: { name: "Sinnar Police Station", phone: "02551-220033", officer: "PI Patil" },
        matches: [{ id: "F-100001", score: 97, strong: true, open: true }],
        call: null,
      });
      expect(one.body.timeline.map((t: { text: string }) => t.text)).toContain("Possible match suggested: L-100001 and F-100001 (score 97, strong)");
      expect(JSON.stringify(one.body)).not.toMatch(/861234567890123|9822000000|7020547519/);
      expect((await call(routes.lostFoundOne.GET, "control", "/api/lost-found/E-100001", { params: { id: "E-100001" } })).status).toBe(404);
    });

    it("reveals the caller's number on request and audits it", async () => {
      const number = await call(routes.lostFoundCaller.POST, "control", "/api/lost-found/L-100001/caller", { method: "POST", params: { id: "L-100001" } });
      expect(number.body).toEqual({ phone: "+917020547519" });
      expect(await db.collection("dash_audit_log").findOne({ action: "lost_found.caller.reveal", target: "case:L-100001" })).not.toBeNull();
    });

    it("closes a report as returned, with its match, and records who did it", async () => {
      const bad = await call(routes.lostFoundClose.POST, "control", "/api/lost-found/L-100001/close", { method: "POST", params: { id: "L-100001" }, body: { reason: "returned", alsoClose: "F-100002" } });
      expect(bad.status).toBe(422); // not a suggested match

      const closed = await call(routes.lostFoundClose.POST, "control", "/api/lost-found/L-100001/close", {
        method: "POST", params: { id: "L-100001" }, body: { reason: "returned", note: "Owner collected it", alsoClose: "F-100001" },
      });
      expect(closed.status).toBe(200);
      expect(closed.body).toMatchObject({ open: false, state: "returned", caseStatus: "closed", closed: { by: "Police control room", reason: "returned", note: "Owner collected it" } });
      const found = await db.collection("cases").findOne({ _id: "F-100001" } as never);
      expect(found).toMatchObject({ status: "closed", lostFound: { state: "returned" } });
      expect(await db.collection("case_events").countDocuments({ kind: "closed", caseId: { $in: ["L-100001", "F-100001"] }, by: "Police control room" })).toBe(2);
      expect(await db.collection("dash_audit_log").countDocuments({ action: "lost_found.close" })).toBe(2);

      const again = await call(routes.lostFoundClose.POST, "control", "/api/lost-found/L-100001/close", { method: "POST", params: { id: "L-100001" }, body: {} });
      expect(again.status).toBe(409);

      const stats = await call(routes.lostFoundStats.GET, "control", "/api/lost-found/stats");
      expect(stats.body).toMatchObject({ open: { lost: 0, found: 0 }, matchesToCheck: 0, resolved: 4 });
    });

    it("keeps lost and found out of the emergency figures and lists", async () => {
      const cases = await call(routes.cases.GET, "control", "/api/cases");
      expect(cases.body.items.map((c: { id: string }) => c.id)).toEqual(["E-100001"]);
      const overview = await call(routes.overview.GET, "control", "/api/stats/overview");
      expect(overview.body.totals.emergencies).toBe(1);
    });
  });
});
