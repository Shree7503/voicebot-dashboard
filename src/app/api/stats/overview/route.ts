import { dataEnv, route } from "@/lib/server/http";
import { parseRange } from "@/lib/server/schemas/query";
import { overview } from "@/lib/server/services/stats";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (India time, inclusive; default last 7 days) &env=prod|test */
export const GET = route("viewer", async ({ request }) => overview(dataEnv(request), parseRange(request.nextUrl.searchParams)));
