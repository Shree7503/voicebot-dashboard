import { route } from "@/lib/server/http";
import { getCall } from "@/lib/server/services/calls";

// call ids contain ":" (e.g. "phone:abc"); clients must URL-encode them
export const GET = route<{ id: string }>("reviewer", async ({ params }) =>
  getCall(decodeURIComponent(params.id)),
);
