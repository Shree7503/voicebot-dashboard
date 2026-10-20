import { route } from "@/lib/server/http";
import { AuditQuery, queryObject } from "@/lib/server/schemas/api";
import { intParam } from "@/lib/server/schemas/query";
import { listAudit } from "@/lib/server/services/audit";

/** Audit log, newest first. Filters: action, user (account name), target; page with before. */
export const GET = route("admin", async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const query = AuditQuery.parse(queryObject(params));
  return listAudit({ action: query.action, userName: query.user, target: query.target, before: query.before, limit: intParam(params, "limit", 50, 1, 200) });
});
