import { dataEnv, route } from "@/lib/server/http";
import { revealCallCaller } from "@/lib/server/services/calls";

/** POST: the caller's full number. A POST because each reveal is written to the audit log. */
export const POST = route<{ id: string }>("admin", async ({ request, actor, params }) =>
  revealCallCaller(dataEnv(request), actor, decodeURIComponent(params.id)),
);
