import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/workspace", "/admin", "/settings"];
const AUTH_ROUTES = ["/auth/login", "/auth/register", "/auth/forgot-password", "/auth/reset-password"];
const ADMIN_ROUTES = ["/admin"];

function getTokenFromRequest(request: NextRequest): string | null {
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Check cookie
  const tokenCookie = request.cookies.get("access_token");
  if (tokenCookie) return tokenCookie.value;
  return null;
}

function decodeTokenPayload(token: string): { sub: string; exp: number; is_superuser?: boolean } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    const payload = atob(base64);
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeTokenPayload(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

/**
 * Detect Next.js RSC (React Server Component) payload requests.
 * Next.js sends these during client-side navigation via router.push().
 * They carry the RSC: 1 header or a _rsc query param.
 * Redirecting these causes "TypeError: Load failed / Falling back to browser navigation".
 */
function isRscRequest(request: NextRequest): boolean {
  return (
    request.headers.get("RSC") === "1" ||
    request.nextUrl.searchParams.has("_rsc")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  // ── Protected routes ──────────────────────────────────────────────────────
  if (isProtected) {
    const token = getTokenFromRequest(request);
    const tokenOk = !!token && isTokenValid(token);

    if (!tokenOk) {
      // If the access token is expired but a refresh_token cookie exists, the
      // user is still "logged in" — the axios interceptor will refresh it on
      // the next API call.  Let RSC payload requests AND full-page loads
      // through; only hard-redirect when there's truly no session at all.
      const hasRefreshToken = !!request.cookies.get("refresh_token")?.value;

      if (hasRefreshToken) {
        // Session is alive — let the request through unchanged.
        return NextResponse.next();
      }

      // No session at all: for RSC requests return 401 (prevents navigation
      // crash); for full page loads redirect to login.
      if (isRscRequest(request)) {
        return new NextResponse(JSON.stringify({ detail: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }

      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Admin route protection
    if (isAdminRoute) {
      const payload = decodeTokenPayload(token!);
      if (!payload?.is_superuser) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
  }

  // ── Redirect authenticated users away from auth pages ─────────────────────
  if (isAuthRoute) {
    const token = getTokenFromRequest(request);
    if (token && isTokenValid(token)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
