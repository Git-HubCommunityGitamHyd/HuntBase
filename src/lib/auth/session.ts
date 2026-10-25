import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getSessionSecret } from "./session-secret.ts";
import {
    ADMIN_SESSION_COOKIE_NAME,
    LEGACY_SESSION_COOKIE_NAME,
    PLAYER_SESSION_COOKIE_NAME,
    SESSION_AUDIENCE,
    SESSION_ISSUER,
    SESSION_MAX_AGE_SECONDS,
    SESSION_VERSION,
    decodeSessionClaims,
    encodeBase64Url,
    parseSessionToken,
    type SessionClaims,
    type SessionUser,
} from "./session-token.ts";

export type { SessionClaims, SessionRole, SessionUser } from "./session-token.ts";
export { ADMIN_SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME, PLAYER_SESSION_COOKIE_NAME } from "./session-token.ts";

function createPayload(user: SessionUser, nowSeconds = Math.floor(Date.now() / 1000)): string {
    const claims = {
        id: user.id,
        username: user.username,
        role: user.role,
        ...(user.organization_id !== undefined ? { organization_id: user.organization_id } : {}),
        ...(user.team_id !== undefined ? { team_id: user.team_id } : {}),
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: randomUUID(),
        iat: nowSeconds,
        exp: nowSeconds + SESSION_MAX_AGE_SECONDS,
    };

    const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
    if (!decodeSessionClaims(encodedPayload, nowSeconds)) {
        throw new Error("Invalid session identity claims.");
    }
    return encodedPayload;
}

/** Token format: canonical-base64url(JSON claims) + "." + canonical-base64url(HMAC-SHA-256). */
export function encodeSession(user: SessionUser): string {
    const encodedPayload = createPayload(user);
    const signature = createHmac("sha256", getSessionSecret()).update(encodedPayload, "ascii").digest();
    return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

/** Node.js verifier. Edge callers must use verifySessionTokenWithWebCrypto instead. */
export function decodeSession(token: string): SessionClaims | null {
    try {
        const parsed = parseSessionToken(token);
        if (!parsed) return null;
        const expected = createHmac("sha256", getSessionSecret()).update(parsed.encodedPayload, "ascii").digest();
        const provided = Buffer.from(parsed.signature);
        if (provided.byteLength !== expected.byteLength || !timingSafeEqual(provided, expected)) return null;
        return decodeSessionClaims(parsed.encodedPayload);
    } catch {
        return null;
    }
}

function expireCookie(response: NextResponse, cookieName: string): void {
    response.cookies.set(cookieName, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        expires: new Date(0),
    });
}

function clearOtherCookies(response: NextResponse, keepCookie: string): void {
    if (keepCookie !== PLAYER_SESSION_COOKIE_NAME) expireCookie(response, PLAYER_SESSION_COOKIE_NAME);
    if (keepCookie !== ADMIN_SESSION_COOKIE_NAME) expireCookie(response, ADMIN_SESSION_COOKIE_NAME);
    // Legacy cookie is cleared but never read or accepted.
    expireCookie(response, LEGACY_SESSION_COOKIE_NAME);
}

function writeSessionCookie(response: NextResponse, cookieName: string, user: SessionUser): NextResponse {
    const token = encodeSession(user);
    const claims = decodeSession(token);
    if (!claims) throw new Error("Failed to create a valid session.");

    clearOtherCookies(response, cookieName);
    response.cookies.set(cookieName, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SECONDS,
        expires: new Date(claims.exp * 1000),
    });
    return response;
}

export function setPlayerSessionCookie(response: NextResponse, user: SessionUser): NextResponse {
    if (user.role !== "player" || !user.team_id) throw new Error("A player session requires a team identity.");
    return writeSessionCookie(response, PLAYER_SESSION_COOKIE_NAME, { ...user, role: "player" });
}

export function setAdminSessionCookie(response: NextResponse, user: SessionUser): NextResponse {
    if (user.role !== "super_admin" && user.role !== "club_admin") throw new Error("An administrator session requires an administrator role.");
    if (user.role === "club_admin" && !user.organization_id) throw new Error("A club administrator session requires an organization.");
    return writeSessionCookie(response, ADMIN_SESSION_COOKIE_NAME, user);
}

export function setSessionCookie(response: NextResponse, user: SessionUser): NextResponse {
    return user.role === "player"
        ? setPlayerSessionCookie(response, user)
        : setAdminSessionCookie(response, user);
}

export function getPlayerSession(request: NextRequest): SessionClaims | null {
    const token = request.cookies.get(PLAYER_SESSION_COOKIE_NAME)?.value;
    const session = token ? decodeSession(token) : null;
    return session?.role === "player" ? session : null;
}

export function getAdminSession(request: NextRequest): SessionClaims | null {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    const session = token ? decodeSession(token) : null;
    return session && (session.role === "super_admin" || session.role === "club_admin") ? session : null;
}

/** Reads only the role-specific cookies; the legacy shared cookie is never trusted. */
export function getSession(request: NextRequest): SessionClaims | null {
    const adminSession = getAdminSession(request);
    const playerSession = getPlayerSession(request);
    if (adminSession && playerSession) return null;
    return adminSession || playerSession;
}

export function clearPlayerSessionCookie(response: NextResponse): NextResponse {
    expireCookie(response, PLAYER_SESSION_COOKIE_NAME);
    expireCookie(response, LEGACY_SESSION_COOKIE_NAME);
    return response;
}

export function clearAdminSessionCookie(response: NextResponse): NextResponse {
    expireCookie(response, ADMIN_SESSION_COOKIE_NAME);
    expireCookie(response, LEGACY_SESSION_COOKIE_NAME);
    return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
    expireCookie(response, PLAYER_SESSION_COOKIE_NAME);
    expireCookie(response, ADMIN_SESSION_COOKIE_NAME);
    expireCookie(response, LEGACY_SESSION_COOKIE_NAME);
    return response;
}
