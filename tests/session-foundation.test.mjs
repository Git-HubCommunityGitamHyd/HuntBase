import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
    ADMIN_SESSION_COOKIE_NAME,
    LEGACY_SESSION_COOKIE_NAME,
    PLAYER_SESSION_COOKIE_NAME,
    clearSessionCookie,
    decodeSession,
    encodeSession,
    getAdminSession,
    getPlayerSession,
    getSession,
    setAdminSessionCookie,
    setPlayerSessionCookie,
} from "../src/lib/auth/session.ts";
import { verifyAdminSessionToken, verifySessionToken } from "../src/lib/auth/edge-session.ts";
import { encodeBase64Url, SESSION_AUDIENCE, SESSION_ISSUER, SESSION_VERSION, SESSION_MAX_AGE_SECONDS } from "../src/lib/auth/session-token.ts";

const secret = "0123456789abcdef0123456789abcdef";
const player = { id: "player-1", username: "playerone", role: "player", team_id: "team-1" };
const clubAdmin = { id: "admin-1", username: "hostone", role: "club_admin", organization_id: "org-1" };
const originalSecret = process.env.SESSION_SECRET;

function setSecret(value = secret) {
    process.env.SESSION_SECRET = value;
}

function signedToken(claims, signingSecret = secret) {
    const encodedPayload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = createHmac("sha256", signingSecret).update(encodedPayload, "ascii").digest();
    return `${encodedPayload}.${signature.toString("base64url")}`;
}

function validClaims(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
        id: "player-1",
        username: "playerone",
        role: "player",
        team_id: "team-1",
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: "1234567890abcdef",
        iat: now,
        exp: now + SESSION_MAX_AGE_SECONDS,
        ...overrides,
    };
}

function fakeResponse() {
    const values = new Map();
    const deleted = [];
    return {
        values,
        deleted,
        cookies: {
            set(name, value, options) { values.set(name, { value, options }); },
            delete(name) { deleted.push(name); values.delete(name); },
        },
    };
}

function fakeRequest(values) {
    return { cookies: { get(name) { return values.has(name) ? { value: values.get(name).value } : undefined; } } };
}

test("Node signing and Web Crypto verification interoperate", async () => {
    setSecret();
    const token = encodeSession(player);
    assert.equal(decodeSession(token)?.role, "player");
    assert.equal((await verifySessionToken(token))?.team_id, "team-1");
    assert.equal(await verifyAdminSessionToken(token), null);
});

test("Web Crypto signed tokens are accepted by the Node verifier", async () => {
    setSecret();
    const key = await globalThis.crypto.subtle.importKey(
        "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const payload = Buffer.from(JSON.stringify(validClaims()), "utf8").toString("base64url");
    const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const token = `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
    assert.equal(decodeSession(token)?.id, "player-1");
});

test("tampered payloads and signatures are rejected by both verifiers", async () => {
    setSecret();
    const token = encodeSession(player);
    const [payload, signature] = token.split(".");
    const tamperedPayload = `${payload[0] === "A" ? "B" : "A"}${payload.slice(1)}.${signature}`;
    const tamperedSignature = `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    for (const candidate of [tamperedPayload, tamperedSignature]) {
        assert.equal(decodeSession(candidate), null);
        assert.equal(await verifySessionToken(candidate), null);
    }
});

test("malformed and noncanonical tokens are rejected", async () => {
    setSecret();
    const token = encodeSession(player);
    const [payload, signature] = token.split(".");
    for (const candidate of ["", "..", "a.b.c", "*.abc", `${payload}.`, `${payload}.${signature}=`, `${payload}==.${signature}`]) {
        assert.equal(decodeSession(candidate), null, candidate);
        assert.equal(await verifySessionToken(candidate), null, candidate);
    }
});

test("expired signed sessions are rejected", async () => {
    setSecret();
    const now = Math.floor(Date.now() / 1000);
    const token = signedToken(validClaims({ iat: now - 100, exp: now - 1 }));
    assert.equal(decodeSession(token), null);
    assert.equal(await verifySessionToken(token), null);
});

test("invalid signed claims are rejected", async () => {
    setSecret();
    const now = Math.floor(Date.now() / 1000);
    const invalid = [
        { role: "owner" },
        { id: "" },
        { username: "" },
        { team_id: undefined },
        { iat: now + 120 },
        { exp: now + SESSION_MAX_AGE_SECONDS + 2 },
        { jti: "short" },
        { organization_id: "org-1", unexpected: true },
    ];
    for (const override of invalid) {
        const claims = validClaims(override);
        const token = signedToken(claims);
        assert.equal(decodeSession(token), null, JSON.stringify(override));
        assert.equal(await verifySessionToken(token), null, JSON.stringify(override));
    }
    assert.equal(decodeSession(signedToken(validClaims({ role: "club_admin", team_id: undefined }))), null);
    assert.equal(decodeSession(signedToken(validClaims({ role: "club_admin", team_id: undefined, organization_id: undefined }))), null);
});

test("missing or too-short SESSION_SECRET fails closed without exposing it", async () => {
    setSecret();
    const validToken = encodeSession(player);
    const priorServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = secret;
    delete process.env.SESSION_SECRET;
    assert.throws(() => encodeSession(player), /SESSION_SECRET/);
    assert.equal(decodeSession(validToken), null);
    assert.equal(await verifySessionToken(validToken), null);
    process.env.SESSION_SECRET = "short";
    assert.throws(() => encodeSession(player), /SESSION_SECRET/);
    assert.equal(decodeSession(validToken), null);
    assert.equal(await verifySessionToken(validToken), null);
    if (priorServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorServiceRoleKey;
    setSecret();
});

test("role-specific cookie helpers separate identities and clear the legacy cookie", () => {
    setSecret();
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const adminResponse = fakeResponse();
    adminResponse.values.set(LEGACY_SESSION_COOKIE_NAME, { value: "unsigned-legacy-token" });
    setAdminSessionCookie(adminResponse, clubAdmin);
    assert.ok(adminResponse.values.has(ADMIN_SESSION_COOKIE_NAME));
    for (const name of [PLAYER_SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME]) {
        assert.equal(adminResponse.values.get(name).value, "");
        assert.equal(adminResponse.values.get(name).options.maxAge, 0);
        assert.equal(adminResponse.values.get(name).options.path, "/");
    }
    const adminCookie = adminResponse.values.get(ADMIN_SESSION_COOKIE_NAME);
    assert.equal(adminCookie.options.httpOnly, true);
    assert.equal(adminCookie.options.sameSite, "lax");
    assert.equal(adminCookie.options.path, "/");
    assert.equal(adminCookie.options.secure, true);
    assert.equal(adminCookie.options.expires.getTime(), decodeSession(adminCookie.value).exp * 1000);

    const adminRequest = fakeRequest(adminResponse.values);
    assert.equal(getAdminSession(adminRequest)?.id, "admin-1");
    assert.equal(getPlayerSession(adminRequest), null);
    assert.equal(getSession(adminRequest)?.role, "club_admin");

    const playerResponse = fakeResponse();
    setPlayerSessionCookie(playerResponse, player);
    assert.equal(playerResponse.values.get(ADMIN_SESSION_COOKIE_NAME).value, "");
    assert.equal(playerResponse.values.get(ADMIN_SESSION_COOKIE_NAME).options.maxAge, 0);
    const playerRequest = fakeRequest(playerResponse.values);
    assert.equal(getPlayerSession(playerRequest)?.team_id, "team-1");
    assert.equal(getAdminSession(playerRequest), null);
    assert.equal(getSession(playerRequest)?.role, "player");

    clearSessionCookie(playerResponse);
    for (const name of [PLAYER_SESSION_COOKIE_NAME, ADMIN_SESSION_COOKIE_NAME, LEGACY_SESSION_COOKIE_NAME]) {
        assert.equal(playerResponse.values.get(name).value, "");
        assert.equal(playerResponse.values.get(name).options.path, "/");
        assert.equal(playerResponse.values.get(name).options.maxAge, 0);
        assert.equal(playerResponse.values.get(name).options.expires.getTime(), 0);
    }
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
});
test("legacy shared cookie is not accepted as a session", () => {
    setSecret();
    const request = fakeRequest(new Map([[LEGACY_SESSION_COOKIE_NAME, { value: encodeSession(clubAdmin) }]]));
    assert.equal(getSession(request), null);
    assert.equal(getAdminSession(request), null);
    assert.equal(getPlayerSession(request), null);
});

test.after(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
});




test("admin and player session verification remain role-separated", async () => {
    setSecret();
    const adminToken = encodeSession(clubAdmin);
    const playerToken = encodeSession(player);
    assert.equal((await verifyAdminSessionToken(adminToken))?.role, "club_admin");
    assert.equal(await verifyAdminSessionToken(playerToken), null);
    assert.equal(getAdminSession(fakeRequest(new Map([[ADMIN_SESSION_COOKIE_NAME, { value: playerToken }]]))), null);
    assert.equal(getPlayerSession(fakeRequest(new Map([[PLAYER_SESSION_COOKIE_NAME, { value: adminToken }]]))), null);
});