import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_ISSUER = "huntbase";
export const SESSION_AUDIENCE = "huntbase-web";
export const SESSION_VERSION = 1;
export const MAX_SESSION_TOKEN_LENGTH = 8192;
export const MAX_SESSION_PAYLOAD_BYTES = 6144;
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24 hours

export type SessionRole = "super_admin" | "club_admin" | "player";

export interface SessionUser {
    id: string;
    username: string;
    role: SessionRole;
    organization_id?: string | null;
    team_id?: string | null;
    is_verified?: boolean;
}

export interface SessionClaims extends SessionUser {
    iss: typeof SESSION_ISSUER;
    aud: typeof SESSION_AUDIENCE;
    ver: typeof SESSION_VERSION;
    jti: string;
    iat: number;
    exp: number;
}

const ALLOWED_CLAIMS = new Set([
    "id",
    "username",
    "role",
    "organization_id",
    "team_id",
    "is_verified",
    "iss",
    "aud",
    "ver",
    "jti",
    "iat",
    "exp",
]);

const MAX_FUTURE_IAT_SKEW_SECONDS = 60;

export function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.trim() === secret && secret.length >= 32) {
        return secret;
    }
    if (process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET must be configured with at least 32 bytes in production");
    }
    return "0123456789abcdef0123456789abcdef";
}

export function validateSessionSecret(secret: unknown): secret is string {
    if (typeof secret !== "string" || !secret || secret.trim() !== secret) return false;
    return new TextEncoder().encode(secret).byteLength >= 32;
}

export function encodeBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeBase64Url(value: string): Uint8Array | null {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
    try {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        return encodeBase64Url(bytes) === value ? bytes : null;
    } catch {
        return null;
    }
}

export interface ParsedSessionToken {
    encodedPayload: string;
    signature: Uint8Array;
}

export function parseSessionToken(token: unknown): ParsedSessionToken | null {
    if (typeof token !== "string" || token.length === 0 || token.length > MAX_SESSION_TOKEN_LENGTH) return null;
    const separator = token.indexOf(".");
    if (separator <= 0 || separator !== token.lastIndexOf(".")) return null;

    const encodedPayload = token.slice(0, separator);
    const encodedSignature = token.slice(separator + 1);
    if (!encodedPayload || !encodedSignature) return null;

    const signature = decodeBase64Url(encodedSignature);
    if (!signature || signature.byteLength !== 32) return null;
    return { encodedPayload, signature };
}

export function validateSessionClaims(value: unknown, nowSeconds = Math.floor(Date.now() / 1000)): SessionClaims | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const claims = value as Record<string, unknown>;
    if (Object.keys(claims).some((key) => !ALLOWED_CLAIMS.has(key))) return null;
    if (claims.iss !== SESSION_ISSUER || claims.aud !== SESSION_AUDIENCE || claims.ver !== SESSION_VERSION) return null;
    if (typeof claims.id !== "string" || claims.id.length === 0 || claims.id.length > 256) return null;
    if (typeof claims.username !== "string" || claims.username.length === 0 || claims.username.length > 256) return null;
    if (claims.role !== "super_admin" && claims.role !== "club_admin" && claims.role !== "player") return null;
    if (typeof claims.jti !== "string" || claims.jti.length < 16 || claims.jti.length > 128) return null;
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null;

    const issuedAt = claims.iat as number;
    const expiresAt = claims.exp as number;
    if (issuedAt <= 0 || issuedAt > nowSeconds + MAX_FUTURE_IAT_SKEW_SECONDS) return null;
    if (expiresAt <= nowSeconds || expiresAt <= issuedAt || expiresAt - issuedAt > SESSION_MAX_AGE_SECONDS) return null;

    if (claims.organization_id !== undefined && claims.organization_id !== null && typeof claims.organization_id !== "string") return null;
    if (claims.team_id !== undefined && claims.team_id !== null && typeof claims.team_id !== "string") return null;
    if (claims.role === "player" && typeof claims.team_id !== "string") return null;
    if (claims.role === "club_admin" && typeof claims.organization_id !== "string") return null;
    if (claims.role !== "player" && claims.team_id !== undefined && claims.team_id !== null) return null;

    return {
        id: claims.id,
        username: claims.username,
        role: claims.role,
        organization_id: typeof claims.organization_id === "string" ? claims.organization_id : null,
        team_id: typeof claims.team_id === "string" ? claims.team_id : null,
        is_verified: typeof claims.is_verified === "boolean" ? claims.is_verified : undefined,
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: claims.jti,
        iat: issuedAt,
        exp: expiresAt,
    };
}

export function encodeSessionToken(claims: SessionClaims, secret = getSessionSecret()): string {
    const payloadJson = JSON.stringify(claims);
    const encodedPayload = Buffer.from(payloadJson, "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload, "ascii").digest();
    return `${encodedPayload}.${signature.toString("base64url")}`;
}

export function verifySessionToken(token: unknown, secret = getSessionSecret(), nowSeconds = Math.floor(Date.now() / 1000)): SessionClaims | null {
    if (!validateSessionSecret(secret)) return null;
    const parsed = parseSessionToken(token);
    if (!parsed) return null;

    const expectedSignature = createHmac("sha256", secret).update(parsed.encodedPayload, "ascii").digest();
    if (parsed.signature.byteLength !== expectedSignature.byteLength) return null;
    if (!timingSafeEqual(Buffer.from(parsed.signature), expectedSignature)) return null;

    const payloadBytes = decodeBase64Url(parsed.encodedPayload);
    if (!payloadBytes || payloadBytes.byteLength > MAX_SESSION_PAYLOAD_BYTES) return null;

    try {
        const json = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
        const value: unknown = JSON.parse(json);
        return validateSessionClaims(value, nowSeconds);
    } catch {
        return null;
    }
}
