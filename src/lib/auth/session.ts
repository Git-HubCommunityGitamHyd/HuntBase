import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, hostUsers, teamMembers, teams } from "@/db/schema";
import {
  encodeSessionToken,
  verifySessionToken,
  SESSION_MAX_AGE_SECONDS,
  SESSION_ISSUER,
  SESSION_AUDIENCE,
  SESSION_VERSION,
  SessionClaims,
  SessionRole,
} from "./session-token";

export const SESSION_COOKIE_NAME = "huntbase_session";
const SESSION_MAX_AGE = SESSION_MAX_AGE_SECONDS; // 24 hours

export type AdminSession = {
  kind: "admin";
  id: string;
  username: string;
  role: "super_admin" | "club_admin";
  organizationId: string | null;
};

export type PlayerSession = {
  kind: "player";
  id: string;
  username: string;
  teamId: string;
  eventId: string;
  organizationId: string;
  isVerified: boolean;
};

export type SessionUser = AdminSession | PlayerSession;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Creates a cryptographically signed session token and stores its hash in the database
export async function createSession(
  owner: { hostUserId: string } | { teamMemberId: string }
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + SESSION_MAX_AGE;

  let claims: SessionClaims;

  if ("hostUserId" in owner) {
    const [u] = await db
      .select()
      .from(hostUsers)
      .where(eq(hostUsers.id, owner.hostUserId))
      .limit(1);
    if (!u) throw new Error("Host user not found for session creation");

    claims = {
      id: u.id,
      username: u.username,
      role: u.role as SessionRole,
      organization_id: u.organizationId,
      team_id: null,
      iss: SESSION_ISSUER,
      aud: SESSION_AUDIENCE,
      ver: SESSION_VERSION,
      jti: randomBytes(16).toString("hex"),
      iat: nowSeconds,
      exp: expSeconds,
    };
  } else {
    const [m] = await db
      .select({
        id: teamMembers.id,
        username: teamMembers.username,
        teamId: teamMembers.teamId,
        organizationId: teams.organizationId,
        isVerified: teamMembers.isVerified,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.id, owner.teamMemberId))
      .limit(1);
    if (!m) throw new Error("Team member not found for session creation");

    claims = {
      id: m.id,
      username: m.username,
      role: "player",
      team_id: m.teamId,
      organization_id: m.organizationId,
      is_verified: Boolean(m.isVerified),
      iss: SESSION_ISSUER,
      aud: SESSION_AUDIENCE,
      ver: SESSION_VERSION,
      jti: randomBytes(16).toString("hex"),
      iat: nowSeconds,
      exp: expSeconds,
    };
  }

  const token = encodeSessionToken(claims);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    hostUserId: "hostUserId" in owner ? owner.hostUserId : null,
    teamMemberId: "teamMemberId" in owner ? owner.teamMemberId : null,
    expiresAt: new Date(expSeconds * 1000),
  });

  return token;
}

export async function getSession(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  // 1. Verify cryptographic signature, expiry, and structure
  const claims = verifySessionToken(token);
  if (!claims) return null;

  // 2. Verify server-side session row in database
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;

  // 3. Load authoritative database state
  if (row.hostUserId) {
    const [u] = await db.select().from(hostUsers).where(eq(hostUsers.id, row.hostUserId)).limit(1);
    if (!u || !u.isActive) return null;
    return {
      kind: "admin",
      id: u.id,
      username: u.username,
      role: u.role as AdminSession["role"],
      organizationId: u.organizationId,
    };
  }

  if (row.teamMemberId) {
    const [m] = await db
      .select({
        id: teamMembers.id,
        username: teamMembers.username,
        teamId: teamMembers.teamId,
        eventId: teams.eventId,
        organizationId: teams.organizationId,
        isVerified: teamMembers.isVerified,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.id, row.teamMemberId))
      .limit(1);
    if (!m) return null;
    return { kind: "player", ...m };
  }

  return null;
}

export async function destroySession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export function setSessionCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}

// Guards: call at the top of a route. If the result is a NextResponse, return it.
const deny = (status: number, message: string) =>
  NextResponse.json({ success: false, message }, { status });

export async function requireAdmin(request: NextRequest): Promise<AdminSession | NextResponse> {
  const s = await getSession(request);
  if (!s || s.kind !== "admin") return deny(401, "Unauthorized: admin session required");
  return s;
}

export async function requireSuperAdmin(request: NextRequest): Promise<AdminSession | NextResponse> {
  const s = await requireAdmin(request);
  if (s instanceof NextResponse) return s;
  if (s.role !== "super_admin") return deny(403, "Forbidden: super admin only");
  return s;
}

export async function requirePlayer(request: NextRequest): Promise<PlayerSession | NextResponse> {
  const s = await getSession(request);
  if (!s || s.kind !== "player") return deny(401, "Unauthorized: player login required");
  return s;
}

export async function requireVerifiedPlayer(
  request: NextRequest
): Promise<PlayerSession | NextResponse> {
  const s = await requirePlayer(request);
  if (s instanceof NextResponse) return s;
  if (!s.isVerified) {
    return deny(403, "Verify your @student.gitam.edu email before scanning");
  }
  return s;
}
