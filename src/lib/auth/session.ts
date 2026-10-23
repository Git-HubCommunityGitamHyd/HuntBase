import { NextRequest, NextResponse } from "next/server";

export interface SessionUser {
    id: string;
    username: string;
    role: "super_admin" | "club_admin" | "player";
    organization_id?: string;
    team_id?: string;
}

const SESSION_COOKIE_NAME = "huntbase_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Encodes session data to a secure base64 payload.
 */
export function encodeSession(user: SessionUser): string {
    const payload = JSON.stringify({
        ...user,
        exp: Date.now() + SESSION_MAX_AGE * 1000,
    });
    return Buffer.from(payload).toString("base64url");
}

/**
 * Decodes and validates session from payload.
 */
export function decodeSession(token: string): SessionUser | null {
    try {
        const json = Buffer.from(token, "base64url").toString("utf8");
        const data = JSON.parse(json);
        if (!data || !data.exp || Date.now() > data.exp) {
            return null;
        }
        return data as SessionUser;
    } catch {
        return null;
    }
}

/**
 * Attaches the HttpOnly session cookie to an outgoing response.
 */
export function setSessionCookie(response: NextResponse, user: SessionUser): NextResponse {
    const token = encodeSession(user);
    response.cookies.set(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
    });
    return response;
}

/**
 * Reads session from incoming request cookies.
 */
export function getSession(request: NextRequest): SessionUser | null {
    const cookie = request.cookies.get(SESSION_COOKIE_NAME);
    if (!cookie?.value) return null;
    return decodeSession(cookie.value);
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(response: NextResponse): NextResponse {
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
}
