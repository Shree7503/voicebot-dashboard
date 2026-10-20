import { route } from "@/lib/server/http";

export const GET = route("viewer", async ({ actor }) => ({ account: { name: actor.name, email: actor.email, role: actor.role } }));
