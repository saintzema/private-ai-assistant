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
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtectedRoute = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  // For protected routes, check for valid token
  if (isProtectedRoute) {
    const token = getTokenFromRequest(request);

    if (!token || !isTokenValid(token)) {
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

  // Redirect authenticated users away from auth pages
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
