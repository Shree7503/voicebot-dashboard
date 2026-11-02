import { z } from "zod";
import { readJson, route } from "@/lib/server/http";
import { deleteDocument, listDocuments, openLink, uploadLink } from "@/lib/server/services/documents";

/**
 * Documents (PDFs) in S3 under uploads/. The dashboard never handles the file itself: it hands
 * out 5-minute signed links, and the browser talks to S3 directly.
 */

/** The documents in uploads/, newest first. */
export const GET = route("admin", async () => listDocuments());

const UploadBody = z.strictObject({
  fileName: z.string().trim().min(1, "Choose a file.").max(255),
  size: z.number().int(),
  contentType: z.string(),
  // an existing document's key: replace it (an update) instead of adding a new one
  key: z.string().max(1024).optional(),
});

/** A 5-minute upload link. Without `key` it adds a new document; with an existing key it replaces it. */
export const POST = route("admin", async ({ request, actor }) => uploadLink(actor, await readJson(request, UploadBody)));

/** ?key=uploads/… — deletes the document (restorable for 30 days: the bucket is versioned). */
export const DELETE = route("admin", async ({ request, actor }) => deleteDocument(actor, request.nextUrl.searchParams.get("key") ?? ""));

const OpenBody = z.strictObject({ key: z.string().max(1024) });

/** { key } — a 5-minute link that opens the document. */
export const PATCH = route("admin", async ({ request, actor }) => openLink(actor, (await readJson(request, OpenBody)).key));
