import { route } from "@/lib/server/http";
import { parseRange } from "@/lib/server/schemas/query";
import { timing } from "@/lib/server/services/stats";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (India time, inclusive; default last 7 days) */
export const GET = route("viewer", async ({ request }) => timing(parseRange(request.nextUrl.searchParams)));
