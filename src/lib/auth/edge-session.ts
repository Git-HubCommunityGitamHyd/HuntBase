import { getSessionSecret } from "./session-secret.ts";
import { verifySessionTokenWithWebCrypto, type SessionClaims } from "./session-token.ts";

/** Verifies a signed HuntBase token using Edge-compatible Web Crypto. */
export async function verifySessionToken(token: string | undefined): Promise<SessionClaims | null> {
    if (!token) return null;
    try {
        return await verifySessionTokenWithWebCrypto(token, getSessionSecret());
    } catch {
        return null;
    }
}

/** Verifies an administrator token and rejects player-role sessions. */
export async function verifyAdminSessionToken(token: string | undefined): Promise<SessionClaims | null> {
    const session = await verifySessionToken(token);
    return session && (session.role === "super_admin" || session.role === "club_admin") ? session : null;
}
