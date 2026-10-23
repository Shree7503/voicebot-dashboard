import { route } from "@/lib/server/http";
import { getLostFound } from "@/lib/server/services/lost-found";

/** One report: item details, place, station, match, call and timeline. The caller's number is masked. */
export const GET = route<{ id: string }>("reviewer", async ({ params }) => getLostFound(params.id));
