import { connection } from "next/server";
import { db } from "@/lib/server/db";

/** Liveness and database reachability. Public; reveals nothing but up or down. */
export async function GET() {
  await connection();
  try {
    await (await db()).command({ ping: 1 });
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
