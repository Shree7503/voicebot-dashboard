import { z } from "zod";
import { route } from "@/lib/server/http";
import { queryObject } from "@/lib/server/schemas/api";
import { intParam, parseRange } from "@/lib/server/schemas/query";
import { LOST_FOUND_STATUSES, lostFoundList } from "@/lib/server/services/lost-found";

const Query = z.object({
  status: z.enum(LOST_FOUND_STATUSES).optional(),
  before: z.iso.datetime({ offset: true, message: "before must be an ISO timestamp from nextBefore." }).optional(),
});

/** Reports: reference, status, station and dates only. Filters: status, from, to; page with before. */
export const GET = route("viewer", async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const { status, before } = Query.parse(queryObject(params));
  const range = parseRange(params);
  return lostFoundList({ status, before, from: range.fromDay, to: range.toDay, limit: intParam(params, "limit", 100, 1, 200) });
});
