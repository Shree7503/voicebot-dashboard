import { connection, type NextRequest } from "next/server";
import { login } from "@/lib/server/auth/login";
import { sessionCookie } from "@/lib/server/auth/session";
import { env } from "@/lib/server/env";
import { clientIp, readJson, toResponse } from "@/lib/server/http";
import { LoginBody } from "@/lib/server/schemas/api";

/** { email, password } for the control room account. Sets the session cookie. */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const { email, password } = await readJson(request, LoginBody);
    const { token, settings } = await login(email, password, clientIp(request));
    const response = Response.json({ account: { name: settings.name, email: settings.email }, expiresInHours: settings.sessionHours });
    response.headers.append("Set-Cookie", sessionCookie(token, settings.sessionHours * 3600, env.isProduction));
    return response;
  } catch (error) {
    return toResponse(error);
  }
}
