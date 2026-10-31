import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "./session";

type SessionGuards = typeof import("./session");
let guards: SessionGuards;
before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  guards = await import("./session");
});

const request = (authenticated = true) => new NextRequest("http://localhost/api/test", {
  headers: authenticated ? { cookie: "huntbase_session=fake-session-token" } : {},
});
const resolver = (session: SessionUser | null) => async (req: NextRequest) =>
  req.cookies.get("huntbase_session")?.value === "fake-session-token" ? session : null;

const superAdmin: SessionUser = {
  kind: "admin", id: "admin-1", username: "root", role: "super_admin", organizationId: null,
};
const clubAdmin: SessionUser = {
  kind: "admin", id: "admin-2", username: "club", role: "club_admin", organizationId: "org-1",
};
const verifiedPlayer: SessionUser = {
  kind: "player", id: "player-1", username: "player", teamId: "team-1", eventId: "event-1",
  organizationId: "org-1", isVerified: true,
};
const unverifiedPlayer: SessionUser = { ...verifiedPlayer, id: "player-2", isVerified: false };

test("player-only gameplay access denies missing sessions and both admin roles", async () => {
  for (const session of [null, superAdmin, clubAdmin]) {
    const result = await guards.requireVerifiedPlayer(request(), resolver(session));
    assert.ok(result instanceof NextResponse);
    assert.equal(result.status, 401);
  }
});

test("player-only gameplay access denies a verified player without a session cookie", async () => {
  const result = await guards.requireVerifiedPlayer(request(false), resolver(verifiedPlayer));
  assert.ok(result instanceof NextResponse);
  assert.equal(result.status, 401);
});

test("player-only gameplay access rejects unverified players", async () => {
  const result = await guards.requireVerifiedPlayer(request(), resolver(unverifiedPlayer));
  assert.ok(result instanceof NextResponse);
  assert.equal(result.status, 403);
});

test("player-only gameplay access accepts verified player sessions", async () => {
  assert.deepEqual(await guards.requireVerifiedPlayer(request(), resolver(verifiedPlayer)), verifiedPlayer);
});

test("admin access accepts either admin role and rejects players", async () => {
  assert.deepEqual(await guards.requireAdmin(request(), resolver(superAdmin)), superAdmin);
  assert.deepEqual(await guards.requireAdmin(request(), resolver(clubAdmin)), clubAdmin);
  const playerResult = await guards.requireAdmin(request(), resolver(verifiedPlayer));
  assert.ok(playerResult instanceof NextResponse);
  assert.equal(playerResult.status, 401);
});

test("super-admin access rejects club admins and players", async () => {
  assert.deepEqual(await guards.requireSuperAdmin(request(), resolver(superAdmin)), superAdmin);
  for (const session of [clubAdmin, verifiedPlayer]) {
    const result = await guards.requireSuperAdmin(request(), resolver(session));
    assert.ok(result instanceof NextResponse);
    assert.equal(result.status, session.kind === "admin" ? 403 : 401);
  }
});
