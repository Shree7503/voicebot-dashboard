import { route } from "@/lib/server/http";
import { CallListQuery, queryObject } from "@/lib/server/schemas/api";
import { intParam, parseRange } from "@/lib/server/schemas/query";
import { listCalls } from "@/lib/server/services/calls";

/** Calls, newest first, masked. Filters: from, to, channel, outcome, language; page with before. */
export const GET = route("reviewer", async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const query = CallListQuery.parse(queryObject(params));
  return listCalls({ ...query, range: parseRange(params), limit: intParam(params, "limit", 50, 1, 200) });
});
