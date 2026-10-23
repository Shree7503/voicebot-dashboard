import { z } from "zod";
import { readJson, route } from "@/lib/server/http";
import { CLOSE_REASONS, closeLostFound } from "@/lib/server/services/lost-found";

const CloseBody = z.strictObject({
  reason: z.enum(CLOSE_REASONS).default("returned"),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").default(""),
  // also close the suggested match (the found report for a lost one, or the other way round)
  alsoClose: z.string().trim().max(40).optional(),
});

/** { reason: "returned" | "closed", note?, alsoClose? } — closes the report; written to the audit log. */
export const POST = route<{ id: string }>("reviewer", async ({ request, actor, params }) =>
  closeLostFound(actor, params.id, await readJson(request, CloseBody)),
);
