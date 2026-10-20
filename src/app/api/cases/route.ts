import { route } from "@/lib/server/http";
import { CaseListQuery, queryObject } from "@/lib/server/schemas/api";
import { intParam, parseRange } from "@/lib/server/schemas/query";
import { listCases } from "@/lib/server/services/cases";

/** Emergency cases, newest first. Filters: from, to, status, priority, category, station; page with before. */
export const GET = route("reviewer", async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const query = CaseListQuery.parse(queryObject(params));
  return listCases({ ...query, range: parseRange(params), limit: intParam(params, "limit", 50, 1, 200) });
});
