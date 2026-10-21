import { z } from "zod";
import { route } from "@/lib/server/http";
import { queryObject } from "@/lib/server/schemas/api";
import { intParam, parseRange } from "@/lib/server/schemas/query";
import { KINDS, lostFoundList } from "@/lib/server/services/lost-found";

const Query = z.object({
  kind: z.enum(KINDS).optional(),
  open: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  before: z.iso
    .datetime({ offset: true, message: "before must be an ISO timestamp from nextBefore." })
    .transform((v) => new Date(v))
    .optional(),
});

/** Reports: reference, lost or found, item type, status, match, station, dates. Filters: kind, open, from, to; page with before. */
export const GET = route("viewer", async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const { kind, open, before } = Query.parse(queryObject(params));
  return lostFoundList({ kind, open, before, range: parseRange(params), limit: intParam(params, "limit", 100, 1, 200) });
});
