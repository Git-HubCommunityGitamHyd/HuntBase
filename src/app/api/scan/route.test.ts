import assert from "node:assert/strict";
import { before, test } from "node:test";
import { NextRequest, NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/session";

type ScanHandler = typeof import("./handler").handleScan;
let handleScan: ScanHandler;
before(async () => {
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  ({ handleScan } = await import("./handler"));
});

const request = (authenticated = true) => new NextRequest("http://localhost/api/scan", {
  method: "POST",
  headers: authenticated
    ? { cookie: "huntbase_session=fake-session-token", "content-type": "application/json" }
    : { "content-type": "application/json" },
  body: JSON.stringify({ token: "test-token" }),
});

const resolver = (session: SessionUser | null) => async (req: NextRequest) =>
  req.cookies.get("huntbase_session")?.value === "fake-session-token" ? session : null;

const superAdmin: SessionUser = {
  kind: "admin", id: "admin-1", username: "root", role: "super_admin", organizationId: null,
};
const clubAdmin: SessionUser = {
  kind: "admin", id: "admin-2", username: "club", role: "club_admin", organizationId: "org-1",
};
const unverifiedPlayer: SessionUser = {
  kind: "player", id: "player-1", username: "player", teamId: "team-1", eventId: "event-1",
  organizationId: "org-1", isVerified: false,
};

test("scan endpoint rejects missing sessions and admin roles before querying gameplay data", async () => {
  for (const [req, session, status] of [
    [request(false), unverifiedPlayer, 401],
    [request(), superAdmin, 401],
    [request(), clubAdmin, 401],
    [request(), unverifiedPlayer, 403],
  ] as const) {
    const result = await handleScan(req, resolver(session));
    assert.ok(result instanceof NextResponse);
    assert.equal(result.status, status);
  }
});
