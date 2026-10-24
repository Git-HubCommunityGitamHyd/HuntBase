import { NextRequest, NextResponse } from "next/server";

import crypto from "crypto";

export interface SessionUser {
    id: string;
    username: string;
    role: "super_admin" | "club_admin" | "player";
    organization_id?: string;
    team_id?: string;
}

const SESSION_COOKIE_NAME = "huntbase_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

const SESSION_SECRET =
    process.env.SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "huntbase-secure-default-secret-salt";

function getHmacSignature(payload: string): string {
    return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

/**
 * Encodes session data to a secure base64 payload.
 * Token format: <base64Payload>.<hmacSignature>
 */
export function encodeSession(user: SessionUser): string {
    const payload = JSON.stringify({
        ...user,
        exp: Date.now() + SESSION_MAX_AGE * 1000,
    });
    const base64Payload = Buffer.from(payload).toString("base64url");
    const signature = getHmacSignature(base64Payload);
    return `${base64Payload}.${signature}`;
}

/**
 * Decodes and validates session from payload.
 * Verifies the HMAC-SHA256 signature before parsing.
 */
export function decodeSession(token: string): SessionUser | null {
    try {
        if (!token || typeof token !== "string") {
            return null;
        }

        const parts = token.split(".");
        if (parts.length !== 2) {
            return null;
        }

        const [base64Payload, signature] = parts;
        if (!base64Payload || !signature) {
            return null;
        }

        const expectedSignature = getHmacSignature(base64Payload);
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (
            sigBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
        ) {
            return null;
        }

        const json = Buffer.from(base64Payload, "base64url").toString("utf8");
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
