import type { TokenPayload } from "@/types";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ─── Token accessors ───────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function removeToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export function removeRefreshToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  removeToken();
  removeRefreshToken();
}

// ─── Token decoding ────────────────────────────────────────────────────────────

export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as TokenPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeToken(token);
  if (!payload) return true;
  // Check if expiry is in the past (with 30 second buffer)
  return payload.exp * 1000 < Date.now() - 30_000;
}

// ─── Auth state checks ─────────────────────────────────────────────────────────

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  return !isTokenExpired(token);
}

export function isSuperuser(): boolean {
  const token = getToken();
  if (!token) return false;
  const payload = decodeToken(token);
  return payload?.is_superuser ?? false;
}

export function getCurrentUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.sub ?? null;
}

export function getCurrentUserEmail(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeToken(token);
  return payload?.email ?? null;
}
