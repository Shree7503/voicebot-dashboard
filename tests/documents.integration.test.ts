/**
 * /api/documents against a stand-in for AWS: fixed credentials (so links are signed offline)
 * and a stub for S3 calls. Needs MongoDB for sign-in and the audit log, like the API suite:
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27099 npm test
 */
import { randomBytes } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
// no Vercel OIDC under Vitest: fixed credentials let the SDK sign links offline
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: () => async () => ({ accessKeyId: "AKIATESTTESTTEST", secretAccessKey: "test-secret" }),
}));

const URI = process.env.TEST_MONGODB_URI;
const DB_NAME = `rakshak_docs_${randomBytes(4).toString("hex")}`;
const BUCKET = "voicebot-documents-test";
const PASSWORD = "Control room test 2026";

type Handler = (request: NextRequest, segment: { params: Promise<Record<string, string>> }) => Promise<Response>;

describe.skipIf(!URI)("documents API (S3 stubbed)", () => {
  let client: MongoClient;
  let db: Db;
  let cookie = "";
  let docs: Record<string, Handler>;
  // the S3 calls made, and what the stub answers
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const stored = new Map<string, { size: number; at: Date }>();

  async function call(handler: Handler, path: string, init: { method?: string; body?: unknown } = {}) {
    const request = new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers: { "content-type": "application/json", cookie },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const response = await handler(request, { params: Promise.resolve({}) });
    return { status: response.status, body: await response.json() };
  }

  beforeAll(async () => {
    Object.assign(process.env, {
      MONGODB_URI: URI,
      CITIZEN_DB: DB_NAME,
      DASHBOARD_JWT_SECRET: randomBytes(32).toString("hex"),
      DASHBOARD_EMAIL: "control@example.test",
      AWS_ROLE_ARN: "arn:aws:iam::111122223333:role/test-docs",
      AWS_REGION: "ap-south-1",
      S3_BUCKET_NAME: BUCKET,
    });
    client = await new MongoClient(URI!).connect();
    db = client.db(DB_NAME);

    const { S3Client } = await import("@aws-sdk/client-s3");
    vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = command.constructor.name;
      sent.push({ name, input: command.input });
      const key = command.input.Key as string;
      if (name === "ListObjectsV2Command") {
        return {
          Contents: [
            { Key: "uploads/", Size: 0, LastModified: new Date("2026-10-01") },
            ...[...stored].map(([Key, v]) => ({ Key, Size: v.size, LastModified: v.at })),
          ],
          IsTruncated: false,
        };
      }
      if (name === "HeadObjectCommand" || name === "DeleteObjectCommand") {
        if (!stored.has(key)) throw Object.assign(new Error("NotFound"), { name: "NotFound" });
        if (name === "DeleteObjectCommand") stored.delete(key);
        return { ContentLength: stored.get(key)?.size };
      }
      throw new Error(`unexpected ${name}`);
    }) as never);

    docs = (await import("@/app/api/documents/route")) as unknown as Record<string, Handler>;
    const login = (await import("@/app/api/auth/login/route")) as unknown as Record<string, Handler>;
    const { hashPassword } = await import("@/lib/server/auth/password");
    process.env.DASHBOARD_PASSWORD_HASH = await hashPassword(PASSWORD);
    const response = await login.POST(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "control@example.test", password: PASSWORD }),
      }),
      { params: Promise.resolve({}) },
    );
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  });

  beforeEach(() => {
    sent.length = 0;
    stored.clear();
    stored.set("uploads/mh1a2b3c-Station list.pdf", { size: 120_000, at: new Date("2026-10-20") });
    stored.set("uploads/mh9z8y7x-Kumbh plan.pdf", { size: 2_400_000, at: new Date("2026-10-30") });
  });

  afterAll(async () => {
    await db?.dropDatabase();
    await client?.close();
  });

  it("needs a session", async () => {
    const response = await docs.GET(new NextRequest("http://localhost/api/documents"), { params: Promise.resolve({}) });
    expect(response.status).toBe(401);
  });

  it("lists the documents in uploads/, newest first, without the folder itself", async () => {
    const list = await call(docs.GET, "/api/documents");
    expect(list.body.items.map((d: { name: string }) => d.name)).toEqual(["Kumbh plan.pdf", "Station list.pdf"]);
    expect(sent[0].input).toMatchObject({ Bucket: BUCKET, Prefix: "uploads/" });
  });

  it("gives a 5-minute upload link for a new PDF, signed for its type and exact size", async () => {
    const link = await call(docs.POST, "/api/documents", {
      method: "POST",
      body: { fileName: "../../etc/Nashik stations.pdf", size: 6_000_000, contentType: "application/pdf" },
    });
    expect(link.status).toBe(200);
    expect(link.body.key).toMatch(/^uploads\/[a-z0-9]+-Nashik stations\.pdf$/);
    expect(link.body).toMatchObject({ method: "PUT", expiresIn: 300, replacing: false, headers: { "Content-Type": "application/pdf" } });
    const url = new URL(link.body.url);
    expect(url.hostname).toContain(BUCKET);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toMatch(/content-length/);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toMatch(/content-type/);
    expect(await db.collection("dash_audit_log").findOne({ action: "document.upload", target: `document:${link.body.key}` })).not.toBeNull();
  });

  it("refuses files that aren't PDFs, are empty or too large", async () => {
    const post = (body: object) => call(docs.POST, "/api/documents", { method: "POST", body: { fileName: "a.pdf", size: 1000, contentType: "application/pdf", ...body } });
    expect((await post({ contentType: "image/png" })).status).toBe(422);
    expect((await post({ fileName: "notes.docx" })).status).toBe(422);
    expect((await post({ size: 0 })).status).toBe(422);
    expect((await post({ size: 51 * 1024 * 1024 })).status).toBe(413);
  });

  it("replaces an existing document under the same key, and only an existing one", async () => {
    const replace = await call(docs.POST, "/api/documents", {
      method: "POST",
      body: { fileName: "new version.pdf", size: 130_000, contentType: "application/pdf", key: "uploads/mh1a2b3c-Station list.pdf" },
    });
    expect(replace.body).toMatchObject({ key: "uploads/mh1a2b3c-Station list.pdf", replacing: true });
    expect(await db.collection("dash_audit_log").findOne({ action: "document.replace" })).not.toBeNull();

    const missing = await call(docs.POST, "/api/documents", {
      method: "POST",
      body: { fileName: "x.pdf", size: 10, contentType: "application/pdf", key: "uploads/nope.pdf" },
    });
    expect(missing.status).toBe(404);
    const outside = await call(docs.POST, "/api/documents", {
      method: "POST",
      body: { fileName: "x.pdf", size: 10, contentType: "application/pdf", key: "secrets/keys.pdf" },
    });
    expect(outside.status).toBe(422);
  });

  it("deletes a document (restorable: the bucket is versioned) and audits it", async () => {
    const del = await call(docs.DELETE, "/api/documents?key=" + encodeURIComponent("uploads/mh9z8y7x-Kumbh plan.pdf"), { method: "DELETE" });
    expect(del.body).toEqual({ ok: true, key: "uploads/mh9z8y7x-Kumbh plan.pdf", restorableForDays: 30 });
    expect(sent.map((s) => s.name)).toEqual(["HeadObjectCommand", "DeleteObjectCommand"]);
    expect(await db.collection("dash_audit_log").findOne({ action: "document.delete" })).toMatchObject({ before: { name: "Kumbh plan.pdf", size: 2_400_000 } });
    expect((await call(docs.DELETE, "/api/documents?key=uploads/", { method: "DELETE" })).status).toBe(422);
    expect((await call(docs.DELETE, "/api/documents?key=uploads/gone.pdf", { method: "DELETE" })).status).toBe(404);
  });

  it("gives a 5-minute link that opens the PDF in the browser", async () => {
    const open = await call(docs.PATCH, "/api/documents", { method: "PATCH", body: { key: "uploads/mh1a2b3c-Station list.pdf" } });
    expect(open.body).toMatchObject({ name: "Station list.pdf", expiresIn: 300 });
    const url = new URL(open.body.url);
    expect(url.searchParams.get("response-content-disposition")).toBe("inline; filename*=UTF-8''Station%20list.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(await db.collection("dash_audit_log").findOne({ action: "document.open" })).not.toBeNull();
  });

  it("tells a refused role apart from a missing S3 permission", async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const spy = vi.mocked(S3Client.prototype.send);
    spy.mockRejectedValueOnce(Object.assign(new Error("Not authorized to perform sts:AssumeRoleWithWebIdentity"), { name: "AccessDenied" }));
    const trust = await call(docs.GET, "/api/documents");
    expect(trust.body.error.code).toBe("role_not_trusted");
    spy.mockRejectedValueOnce(Object.assign(new Error("Access Denied"), { name: "AccessDenied" }));
    const perms = await call(docs.GET, "/api/documents");
    expect(perms.body.error.code).toBe("storage_denied");
  });

  it("says so when storage isn't configured", async () => {
    const saved = process.env.S3_BUCKET_NAME;
    delete process.env.S3_BUCKET_NAME;
    const list = await call(docs.GET, "/api/documents");
    process.env.S3_BUCKET_NAME = saved;
    expect(list.status).toBe(503);
    expect(list.body.error.code).toBe("not_configured");
  });
});
