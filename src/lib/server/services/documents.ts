import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { env } from "../env";
import { ApiError } from "../errors";
import type { Actor } from "../http";
import { audit } from "./audit";

/**
 * Documents: PDFs in the S3 bucket under `uploads/`. The dashboard holds no AWS keys: it
 * assumes AWS_ROLE_ARN through Vercel OIDC. Files never pass through the dashboard: the
 * browser uploads straight to S3 with a 5-minute signed link, and opens files the same way,
 * so Vercel's 4.5 MB request limit doesn't apply. The bucket is versioned, so a deleted or
 * replaced document can be restored for 30 days.
 */

export const PREFIX = "uploads/";
export const LINK_SECONDS = 300;
export const MAX_BYTES = 50 * 1024 * 1024;
const PDF = "application/pdf";

let client: { key: string; s3: S3Client } | null = null;

function settings() {
  const docs = env.documents;
  if (!docs) throw new ApiError(503, "not_configured", "Document storage is not set up: AWS_ROLE_ARN, AWS_REGION and S3_BUCKET_NAME are needed in .env.");
  return docs;
}

function s3(): { s3: S3Client; bucket: string } {
  const docs = settings();
  const key = `${docs.roleArn}|${docs.region}`;
  if (client?.key !== key) {
    client = {
      key,
      s3: new S3Client({
        region: docs.region,
        credentials: awsCredentialsProvider({ roleArn: docs.roleArn, clientConfig: { region: docs.region } }),
      }),
    };
  }
  return { s3: client.s3, bucket: docs.bucket };
}

/** AWS and OIDC failures as messages for the control room; details go to the server log. */
function storageError(error: unknown, key?: string): never {
  if (error instanceof ApiError) throw error;
  const name = error instanceof S3ServiceException ? error.name : (error as Error)?.name;
  if (name === "NotFound" || name === "NoSuchKey") throw new ApiError(404, "not_found", `There is no document ${key ?? ""}.`.replace(" .", "."));
  console.error("[documents]", error);
  const text = `${name} ${(error as Error)?.message}`;
  // checked first: AWS answers "AccessDenied" both when the role can't be assumed and when the
  // role lacks an S3 permission, and the fixes are in different places
  if (/AssumeRoleWithWebIdentity/i.test(text)) {
    throw new ApiError(
      503,
      "role_not_trusted",
      "AWS refused to let the dashboard use its role. The role's trust policy must accept this Vercel project and environment.",
    );
  }
  if (/VercelOidc|VERCEL_OIDC_TOKEN|x-vercel-oidc-token|vc link/i.test(text)) {
    throw new ApiError(503, "storage_auth", "The dashboard couldn't sign in to document storage. On Vercel this is automatic; locally, run `vercel env pull` first.");
  }
  if (name === "AccessDenied" || name === "Forbidden") {
    throw new ApiError(503, "storage_denied", "The dashboard's AWS role isn't allowed to do this in the bucket. Check the role's S3 permissions.");
  }
  if (name === "ExpiredTokenException" || /expired/i.test(text)) {
    throw new ApiError(503, "storage_auth", "The sign-in to document storage expired. Locally, run `vercel env pull` again.");
  }
  throw new ApiError(502, "storage_error", "Document storage didn't answer. Try again in a minute.");
}

/** "uploads/mh9x2k1a-Station list.pdf" -> "Station list.pdf" */
export function displayName(key: string): string {
  const name = key.slice(PREFIX.length);
  return name.replace(/^[a-z0-9]{6,12}-/, "");
}

/** A file name safe for an S3 key: no folders, no control characters, ends in .pdf. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*#%&{}^~`[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (!cleaned.toLowerCase().endsWith(".pdf")) throw new ApiError(422, "not_pdf", "Only PDF files can be uploaded.");
  return cleaned;
}

/** Keys from the browser must name a document under uploads/. */
export function checkKey(key: string): string {
  if (!key.startsWith(PREFIX) || key.length <= PREFIX.length || key.includes("..") || key.endsWith("/")) {
    throw new ApiError(422, "bad_key", "That is not a document key.");
  }
  return key;
}

async function exists(key: string) {
  const { s3: c, bucket } = s3();
  try {
    return await c.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    storageError(error, key);
  }
}

export async function listDocuments() {
  const { s3: c, bucket } = s3();
  const items: { key: string; name: string; size: number; lastModified: string | null }[] = [];
  try {
    let token: string | undefined;
    do {
      const page = await c.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, ContinuationToken: token }));
      for (const o of page.Contents ?? []) {
        if (!o.Key || o.Key.endsWith("/")) continue;
        items.push({ key: o.Key, name: displayName(o.Key), size: o.Size ?? 0, lastModified: o.LastModified?.toISOString() ?? null });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token && items.length < 5000);
  } catch (error) {
    storageError(error);
  }
  items.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
  return { items };
}

/**
 * A 5-minute link the browser PUTs the PDF to. Without `key` it makes a new document; with an
 * existing key it replaces that document (the old version stays in the bucket's history). The
 * signature covers the type and exact size, so S3 refuses any other file.
 */
export async function uploadLink(actor: Actor, input: { fileName: string; size: number; contentType: string; key?: string }) {
  if (input.contentType !== PDF) throw new ApiError(422, "not_pdf", "Only PDF files can be uploaded.");
  if (!Number.isInteger(input.size) || input.size <= 0) throw new ApiError(422, "empty_file", "The file is empty.");
  if (input.size > MAX_BYTES) throw new ApiError(413, "too_large", `PDFs can be up to ${MAX_BYTES / 1024 / 1024} MB.`);

  let key: string;
  if (input.key) {
    key = checkKey(input.key);
    await exists(key); // 404 if there is nothing to replace
  } else {
    key = `${PREFIX}${Date.now().toString(36)}-${safeFileName(input.fileName)}`;
  }

  const { s3: c, bucket } = s3();
  let url: string;
  try {
    url = await getSignedUrl(c, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: PDF, ContentLength: input.size }), {
      expiresIn: LINK_SECONDS,
      // the presigner leaves Content-Type unsigned by default; sign it so the link takes PDFs only
      signableHeaders: new Set(["content-type"]),
    });
  } catch (error) {
    storageError(error, key);
  }
  await audit(actor, input.key ? "document.replace" : "document.upload", `document:${key}`, null, { name: displayName(key), size: input.size });
  return { key, name: displayName(key), url, method: "PUT" as const, headers: { "Content-Type": PDF }, expiresIn: LINK_SECONDS, replacing: Boolean(input.key) };
}

/** Deletes a document. The bucket is versioned, so it can be restored for 30 days. */
export async function deleteDocument(actor: Actor, key: string) {
  checkKey(key);
  const head = await exists(key);
  const { s3: c, bucket } = s3();
  try {
    await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    storageError(error, key);
  }
  await audit(actor, "document.delete", `document:${key}`, { name: displayName(key), size: head?.ContentLength ?? null }, null);
  return { ok: true, key, restorableForDays: 30 };
}

/** A 5-minute link that opens the PDF in the browser. */
export async function openLink(actor: Actor, key: string) {
  checkKey(key);
  await exists(key);
  const { s3: c, bucket } = s3();
  const name = displayName(key);
  let url: string;
  try {
    url = await getSignedUrl(
      c,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: PDF,
        ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      }),
      { expiresIn: LINK_SECONDS },
    );
  } catch (error) {
    storageError(error, key);
  }
  await audit(actor, "document.open", `document:${key}`, null, null);
  return { key, name, url, expiresIn: LINK_SECONDS };
}
