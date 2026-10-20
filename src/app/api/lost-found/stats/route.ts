import { route } from "@/lib/server/http";
import { parseRange } from "@/lib/server/schemas/query";
import { lostFoundStats } from "@/lib/server/services/lost-found";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (India time, inclusive; default last 7 days): counts only. */
export const GET = route("viewer", async ({ request }) => {
  const range = parseRange(request.nextUrl.searchParams);
  return lostFoundStats(range.fromDay, range.toDay);
});
