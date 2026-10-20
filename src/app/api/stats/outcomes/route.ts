import { route } from "@/lib/server/http";
import { parseRange } from "@/lib/server/schemas/query";
import { outcomes } from "@/lib/server/services/stats";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (India time, inclusive; default last 7 days) */
export const GET = route("viewer", async ({ request }) => outcomes(parseRange(request.nextUrl.searchParams)));
