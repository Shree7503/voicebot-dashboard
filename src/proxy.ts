import { NextResponse, type NextRequest } from "next/server";
import { authSettings, SESSION_COOKIE, verifySession } from "@/lib/server/auth/session";

/**
 * Sign-in gate for the whole dashboard. Without a valid session, pages redirect to /login
 * (with ?expired=1 when an old session was rejected) and API routes answer 401. Writes from
 * another site are refused. API handlers check the session again (lib/server/http.ts).
 */

const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/health"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function json(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (!SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== request.nextUrl.host) {
      return json(403, "bad_origin", "This request came from another site and was blocked.");
    }
  }
  if (PUBLIC_API.has(pathname)) return NextResponse.next();

  const settings = authSettings();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const account = "missing" in settings ? null : await verifySession(token, settings);

  if (pathname === "/login") {
    return account ? NextResponse.redirect(new URL("/overview", request.url)) : NextResponse.next();
  }
  if (account) return NextResponse.next();

  if (isApi) {
    if ("missing" in settings) return json(503, "not_configured", `Sign-in is not set up: ${settings.missing} is missing from .env.`);
    return json(401, "unauthenticated", "Your session has ended. Sign in again.");
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  if (token) login.searchParams.set("expired", "1");
  const response = NextResponse.redirect(login);
  if (token) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  // everything except Next.js assets and files with an extension (favicon, images)
  matcher: ["/((?!_next/|.*\\.[\\w]+$).*)"],
};
