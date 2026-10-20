import { dataEnv, route } from "@/lib/server/http";
import { revealCaseCaller } from "@/lib/server/services/cases";

/** POST: the caller's full number. A POST because each reveal is written to the audit log. */
export const POST = route<{ id: string }>("admin", async ({ request, actor, params }) =>
  revealCaseCaller(dataEnv(request), actor, params.id),
);
