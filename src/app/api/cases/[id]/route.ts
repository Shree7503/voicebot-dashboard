import { dataEnv, readJson, route } from "@/lib/server/http";
import { CaseActionBody } from "@/lib/server/schemas/api";
import { actOnCase, getCase } from "@/lib/server/services/cases";

type Params = { id: string };

export const GET = route<Params>("reviewer", async ({ request, params }) => getCase(dataEnv(request), params.id));

/** { action: "status", status: "acknowledged" | "closed", note } or { action: "verdict", verdict, note } */
export const PATCH = route<Params>("reviewer", async ({ request, actor, params }) =>
  actOnCase(dataEnv(request), actor, params.id, await readJson(request, CaseActionBody)),
);
