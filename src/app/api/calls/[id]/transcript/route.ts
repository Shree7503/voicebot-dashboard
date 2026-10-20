import { route } from "@/lib/server/http";
import { getTranscript } from "@/lib/server/services/calls";

/** The call's conversation (already redacted by the bot). Each view is written to the audit log. */
export const GET = route<{ id: string }>("admin", async ({ actor, params }) =>
  getTranscript(actor, decodeURIComponent(params.id)),
);
