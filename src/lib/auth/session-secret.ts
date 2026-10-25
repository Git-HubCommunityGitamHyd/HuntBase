import { assertValidSessionSecret } from "./session-token.ts";

/** Reads only the explicitly configured HuntBase session secret. */
export function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    assertValidSessionSecret(secret);
    return secret;
}
