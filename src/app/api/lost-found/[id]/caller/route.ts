import { route } from "@/lib/server/http";
import { revealLostFoundCaller } from "@/lib/server/services/lost-found";

/** POST: the caller's full number. A POST because each reveal is written to the audit log. */
export const POST = route<{ id: string }>("reviewer", async ({ actor, params }) => revealLostFoundCaller(actor, params.id));
