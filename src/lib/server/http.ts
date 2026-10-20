import "server-only";

import { connection, type NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasRole, type Role } from "./auth/roles";
import { requireAuthSettings } from "./auth/login";
import { SESSION_COOKIE, verifySession } from "./auth/session";
import { ensureDashIndexes } from "./db";
import { env, type DataEnv } from "./env";
import { ApiError } from "./errors";

export { ApiError };

/** Who made a request: the control room account (the only one, for now). */
export interface Actor {
  id: string;
  name: string;
  role: Role;
  ip: string | null;
}

export interface Context<P> {
  request: NextRequest;
  actor: Actor;
  params: P;
}

function errorBody(error: ApiError) {
  return { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } };
}

/** Field-level messages for forms: [{ path: "llm.temperature", message: "..." }]. */
export function zodIssues(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export function toResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json(errorBody(error), { status: error.status });
  if (error instanceof ZodError) {
    return Response.json(
      errorBody(new ApiError(422, "invalid", "Some fields are not valid. Fix them and try again.", zodIssues(error))),
      { status: 422 },
    );
  }
  console.error("[api] unhandled error", error);
  return Response.json(
    errorBody(new ApiError(500, "server_error", "The server could not complete this request. Try again in a minute.")),
    { status: 500 },
  );
}

/** The signed-in account, from a session issued under the current password. */
async function currentActor(request: NextRequest): Promise<Actor> {
  const account = await verifySession(request.cookies.get(SESSION_COOKIE)?.value, requireAuthSettings());
  if (!account) throw new ApiError(401, "unauthenticated", "Your session has ended. Sign in again.");
  return { ...account, ip: clientIp(request) };
}

export function clientIp(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

type Handler<P> = (ctx: Context<P>) => Promise<Response | unknown>;

/**
 * Wraps a route handler: checks the session and the minimum role, turns thrown errors into
 * JSON responses, and returns plain values as JSON.
 */
export function route<P = Record<string, never>>(minimumRole: Role, handler: Handler<P>) {
  return async (request: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    // always request-time: during a build this rejects on purpose to stop prerendering, so it
    // must stay outside the try below
    await connection();
    try {
      await ensureDashIndexes();
      const actor = await currentActor(request);
      if (!hasRole(actor.role, minimumRole)) {
        throw new ApiError(403, "forbidden", "This account is not allowed to do this.");
      }
      const result = await handler({ request, actor, params: await segment.params });
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

export async function readJson<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "bad_json", "The request body is not valid JSON.");
  }
  return schema.parse(body);
}

/** ?env=test reads the browser test page's traffic; anything else reads the default. */
export function dataEnv(request: NextRequest): DataEnv {
  const value = request.nextUrl.searchParams.get("env");
  if (value === "test" || value === "prod") return value;
  return env.defaultDataEnv;
}
