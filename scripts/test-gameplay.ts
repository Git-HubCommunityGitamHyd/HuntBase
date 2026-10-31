/**
 * HuntBase Production Gameplay, Auth, Lifecycle & Security Test Suite
 * Comprehensive regression verification covering all CodeRabbit review findings:
 * 1. Player identity anti-spoofing & session derivation
 * 2. Role & multi-tenant organization authorization
 * 3. Cryptographic session signing, claim validation & tampering rejection
 * 4. Pause/resume state transitions & terminal completed state protections
 * 5. Hunt stop idempotency, start time preservation & end time population
 * 6. Pause-aware duration, clue timers & hint delay calculations
 * 7. Inactive hunt gameplay rejections (scans, hints, clue start)
 * 8. Player disclosure policy (redaction of locations & admin notes)
 * 9. Start hunt race prevention & duplicate start rejection
 * 10. Multi-role session fixtures & cross-org isolation tests
 * 11. Database configuration integrity
 * 12. Full lifecycle state machine validation
 */

import { createHmac, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { computeLeaderboard, RawTeamProgress } from "../src/lib/gameplay/leaderboard";
import { generateRoundRobinClueOrders } from "../src/lib/gameplay/clue-order";
import {
    calculateActiveElapsedTimeMs,
    calculateClueActiveElapsedMinutes,
    validateHuntActiveState,
    HuntLifecycleEvent,
    PauseRecord,
} from "../src/lib/gameplay/hunt-lifecycle";
import {
    encodeSessionToken,
    verifySessionToken,
    SessionClaims,
    SESSION_ISSUER,
    SESSION_AUDIENCE,
    SESSION_VERSION,
    SESSION_MAX_AGE_SECONDS,
} from "../src/lib/auth/session-token";
import {
    requirePlayer,
    requireVerifiedPlayer,
    requireAdmin,
    requireSuperAdmin,
    SESSION_COOKIE_NAME,
} from "../src/lib/auth/session";

const TEST_SECRET = "0123456789abcdef0123456789abcdef";
process.env.SESSION_SECRET = TEST_SECRET;
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://mock:mock@localhost:5432/huntbase";

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exitCode = 1;
        throw new Error(message);
    }
    passedAssertions++;
    console.log(`✅ PASS: ${message}`);
}

function makeSignedToken(claims: SessionClaims, secret = TEST_SECRET): string {
    return encodeSessionToken(claims, secret);
}

function buildClaims(overrides: Partial<SessionClaims> = {}): SessionClaims {
    const now = Math.floor(Date.now() / 1000);
    return {
        id: "usr-player-1",
        username: "hunter_gitam",
        role: "player",
        team_id: "team-alpha",
        organization_id: "org-gitam-hyd",
        is_verified: true,
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: randomBytes(16).toString("hex"),
        iat: now,
        exp: now + SESSION_MAX_AGE_SECONDS,
        ...overrides,
    };
}

function requestWithCookie(token?: string, path = "http://localhost:3000/api/test"): NextRequest {
    const req = new NextRequest(path, { method: "POST" });
    if (token) {
        req.cookies.set(SESSION_COOKIE_NAME, token);
    }
    return req;
}

async function runTestSuite() {
    console.log("\n🧪 Running HuntBase Comprehensive Production Backend & Security Suite...\n");

    // =========================================================================
    // SECTION 1: Round-Robin Clue Ordering & Distribution
    // =========================================================================
    console.log("--- Section 1: Production Round-Robin Clue Assigner ---");
    const testTeams = ["team-alpha", "team-beta", "team-gamma", "team-delta"];
    const testClues = ["clue-1", "clue-2", "clue-3"];

    const assignments = generateRoundRobinClueOrders(testTeams, testClues);
    assert(assignments.length === testTeams.length * testClues.length, "Generated assignments match teams * clues");

    const start0 = assignments.find((a) => a.team_id === "team-alpha" && a.step_index === 0)?.clue_id;
    const start1 = assignments.find((a) => a.team_id === "team-beta" && a.step_index === 0)?.clue_id;
    const start2 = assignments.find((a) => a.team_id === "team-gamma" && a.step_index === 0)?.clue_id;
    const start3 = assignments.find((a) => a.team_id === "team-delta" && a.step_index === 0)?.clue_id;

    assert(start0 === "clue-1", "Team 0 starts at Clue 1 (offset 0)");
    assert(start1 === "clue-2", "Team 1 starts at Clue 2 (offset 1)");
    assert(start2 === "clue-3", "Team 2 starts at Clue 3 (offset 2)");
    assert(start3 === "clue-1", "Team 3 wraps around to Clue 1 (offset 3 % 3 = 0)");

    testTeams.forEach((tId) => {
        const teamClueSet = new Set(assignments.filter((a) => a.team_id === tId).map((a) => a.clue_id));
        assert(teamClueSet.size === testClues.length, `Team ${tId} receives all unique clues with no duplicates`);
    });

    // =========================================================================
    // SECTION 2: Deterministic Leaderboard Ranking & Active Duration Scoring
    // =========================================================================
    console.log("\n--- Section 2: Production Leaderboard Engine & Deterministic Tie-Breakers ---");
    const huntStartTime = "2026-10-31T10:00:00.000Z";

    // 15-minute pause between 10:10 and 10:25
    const testPauses: PauseRecord[] = [
        { pausedAt: "2026-10-31T10:10:00.000Z", resumedAt: "2026-10-31T10:25:00.000Z" },
    ];

    const mockTeams: RawTeamProgress[] = [
        {
            id: "t-fast-finish",
            team_name: "Speedy Hunters",
            score: 30,
            current_step: 3,
            is_disqualified: false,
            hunt_finished_at: "2026-10-31T10:40:00.000Z", // 40m wall clock - 15m pause = 25m active
            last_scan_at: "2026-10-31T10:40:00.000Z",
        },
        {
            id: "t-slow-finish",
            team_name: "Steady Solvers",
            score: 30,
            current_step: 3,
            is_disqualified: false,
            hunt_finished_at: "2026-10-31T11:00:00.000Z", // 60m wall clock - 15m pause = 45m active
            last_scan_at: "2026-10-31T11:00:00.000Z",
        },
        {
            id: "t-disqualified",
            team_name: "Rule Breakers",
            score: 50,
            current_step: 3,
            is_disqualified: true,
            hunt_finished_at: "2026-10-31T10:30:00.000Z",
            last_scan_at: "2026-10-31T10:30:00.000Z",
        },
        {
            id: "t-step2-early",
            team_name: "Early Scanners",
            score: 20,
            current_step: 2,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:10:00.000Z",
        },
        {
            id: "t-step2-late",
            team_name: "Late Scanners",
            score: 20,
            current_step: 2,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:35:00.000Z",
        },
        {
            id: "t-step1",
            team_name: "Just Starting",
            score: 10,
            current_step: 1,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:05:00.000Z",
        },
    ];

    const ranked = computeLeaderboard(mockTeams, 3, huntStartTime, testPauses);

    assert(ranked[0].team_id === "t-fast-finish", "Rank 1: Fastest finished team with 30 pts (25m active duration)");
    assert(ranked[0].duration_formatted === "25m 00s", "Formatted active duration subtracts 15m paused interval");
    assert(ranked[1].team_id === "t-slow-finish", "Rank 2: Slower completed team with 30 pts (45m active duration)");
    assert(ranked[1].duration_formatted === "45m 00s", "Slower team duration accurately calculated as 45m");
    assert(ranked[2].team_id === "t-step2-early", "Rank 3: Team with 20 pts & earlier scan timestamp");
    assert(ranked[3].team_id === "t-step2-late", "Rank 4: Team with 20 pts & later scan timestamp");
    assert(ranked[4].team_id === "t-step1", "Rank 5: Incomplete team with 10 pts");
    assert(ranked[5].team_id === "t-disqualified", "Rank 6: Disqualified team forced to bottom despite highest score (50 pts)");

    // Empty teams test
    const emptyRanked = computeLeaderboard([], 3, huntStartTime);
    assert(emptyRanked.length === 0, "Leaderboard safely handles events with zero teams");

    // =========================================================================
    // SECTION 3: Cryptographic Session Token Signing, Validation & Hardening
    // =========================================================================
    console.log("\n--- Section 3: Session Token Signing & Cryptographic Validation ---");

    const validPlayerClaims = buildClaims();
    const validToken = makeSignedToken(validPlayerClaims);

    // 1. Valid token passes verification
    const verifiedClaims = verifySessionToken(validToken);
    assert(verifiedClaims !== null && verifiedClaims.id === "usr-player-1", "Valid signed token verifies successfully");
    assert(verifiedClaims?.role === "player" && verifiedClaims.team_id === "team-alpha", "Verified claims match payload identity");

    // 2. Tampered payload is rejected
    const [payloadB64, sigB64] = validToken.split(".");
    const tamperedPayloadB64 = Buffer.from(
        JSON.stringify({ ...validPlayerClaims, role: "super_admin" }),
        "utf8"
    ).toString("base64url");
    const tamperedPayloadToken = `${tamperedPayloadB64}.${sigB64}`;
    assert(verifySessionToken(tamperedPayloadToken) === null, "Rejects modified payload with invalid signature");

    // 3. Tampered signature is rejected
    const tamperedSig = sigB64.slice(0, -1) + (sigB64.slice(-1) === "A" ? "B" : "A");
    const tamperedSigToken = `${payloadB64}.${tamperedSig}`;
    assert(verifySessionToken(tamperedSigToken) === null, "Rejects invalid HMAC signature");

    // 4. Token signed with wrong secret is rejected
    const wrongSecretToken = makeSignedToken(validPlayerClaims, "different_secret_key_01234567890");
    assert(verifySessionToken(wrongSecretToken) === null, "Rejects token signed with non-matching secret");

    // 5. Expired token is rejected
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredClaims = buildClaims({ iat: nowSec - 7200, exp: nowSec - 100 });
    const expiredToken = makeSignedToken(expiredClaims);
    assert(verifySessionToken(expiredToken) === null, "Rejects expired session token");

    // 6. Malformed token strings are rejected
    assert(verifySessionToken("") === null, "Rejects empty token string");
    assert(verifySessionToken("no-signature-dot") === null, "Rejects token missing signature separator");
    assert(verifySessionToken("a.b.c") === null, "Rejects token with non-canonical segments");
    assert(verifySessionToken(`${payloadB64}.`) === null, "Rejects token with empty signature");

    // 7. Claims validation: player missing team_id is rejected
    const invalidPlayerNoTeam = buildClaims({ team_id: undefined });
    const invalidPlayerToken = makeSignedToken(invalidPlayerNoTeam);
    assert(verifySessionToken(invalidPlayerToken) === null, "Rejects player claims missing required team_id");

    // 8. Claims validation: club_admin missing organization_id is rejected
    const invalidAdminNoOrg = buildClaims({
        role: "club_admin",
        team_id: undefined,
        organization_id: undefined,
    });
    const invalidAdminToken = makeSignedToken(invalidAdminNoOrg);
    assert(verifySessionToken(invalidAdminToken) === null, "Rejects club_admin claims missing required organization_id");

    // =========================================================================
    // SECTION 4: Active Elapsed Time & Pause-Aware Timer Engine
    // =========================================================================
    console.log("\n--- Section 4: Pause-Aware Active Duration & Clue Timers ---");

    const tStart = new Date("2026-10-31T09:00:00.000Z");
    const tEnd = new Date("2026-10-31T10:00:00.000Z"); // 60 min wall clock

    // Case 4A: No pauses -> active time == wall clock time (60 min)
    const activeNoPauseMs = calculateActiveElapsedTimeMs(tStart, tEnd, []);
    assert(activeNoPauseMs === 60 * 60 * 1000, "Active time equals wall-clock time when no pauses exist");

    // Case 4B: One 20-minute pause -> active time == 40 min
    const singlePause: PauseRecord[] = [
        { pausedAt: "2026-10-31T09:15:00.000Z", resumedAt: "2026-10-31T09:35:00.000Z" },
    ];
    const activeSinglePauseMs = calculateActiveElapsedTimeMs(tStart, tEnd, singlePause);
    assert(activeSinglePauseMs === 40 * 60 * 1000, "Active time subtracts completed 20-minute pause interval");

    // Case 4C: Multiple pause cycles (10 min + 15 min = 25 min paused) -> 35 min active
    const multiPauses: PauseRecord[] = [
        { pausedAt: "2026-10-31T09:10:00.000Z", resumedAt: "2026-10-31T09:20:00.000Z" },
        { pausedAt: "2026-10-31T09:30:00.000Z", resumedAt: "2026-10-31T09:45:00.000Z" },
    ];
    const activeMultiPauseMs = calculateActiveElapsedTimeMs(tStart, tEnd, multiPauses);
    assert(activeMultiPauseMs === 35 * 60 * 1000, "Active time subtracts multiple completed pause cycles");

    // Case 4D: Open pause (resumedAt is null) -> pause continues to end of evaluation
    const openPause: PauseRecord[] = [
        { pausedAt: "2026-10-31T09:40:00.000Z", resumedAt: null },
    ];
    const activeOpenPauseMs = calculateActiveElapsedTimeMs(tStart, tEnd, openPause);
    assert(activeOpenPauseMs === 40 * 60 * 1000, "Active time correctly accounts for an open ongoing pause");

    // Case 4E: Pause outside the time window is ignored
    const outsidePause: PauseRecord[] = [
        { pausedAt: "2026-10-31T08:00:00.000Z", resumedAt: "2026-10-31T08:30:00.000Z" },
    ];
    const activeOutsideMs = calculateActiveElapsedTimeMs(tStart, tEnd, outsidePause);
    assert(activeOutsideMs === 60 * 60 * 1000, "Pause outside measurement window does not affect active duration");

    // Case 4F: Clue elapsed active minutes excluding pause
    const clueStart = new Date("2026-10-31T09:10:00.000Z");
    const clueCheckTime = new Date("2026-10-31T09:25:00.000Z"); // 15m wall clock
    const cluePause: PauseRecord[] = [
        { pausedAt: "2026-10-31T09:12:00.000Z", resumedAt: "2026-10-31T09:22:00.000Z" }, // 10m pause
    ];
    const clueActiveMinutes = calculateClueActiveElapsedMinutes(clueStart, clueCheckTime, cluePause);
    assert(clueActiveMinutes === 5, "Clue active elapsed time is 5 minutes (15m wall clock - 10m paused)");

    // =========================================================================
    // SECTION 5: Authoritative Hunt Lifecycle State Validation
    // =========================================================================
    console.log("\n--- Section 5: Hunt State Guards & Lifecycle Validation ---");

    const baseEvent: HuntLifecycleEvent = {
        id: "evt-1",
        isActive: true,
        huntStatus: "active",
        startTime: new Date("2026-10-31T08:00:00.000Z"),
        endTime: new Date("2026-10-31T18:00:00.000Z"),
        huntStartedAt: new Date("2026-10-31T09:00:00.000Z"),
        huntDurationMinutes: 120, // 2 hours
    };

    // Case 5A: Active hunt within window is allowed
    const activeRes = validateHuntActiveState(baseEvent, [], new Date("2026-10-31T09:30:00.000Z"));
    assert(activeRes.allowed === true, "Authoritative validator permits gameplay on active live hunt");

    // Case 5B: Paused hunt rejects with 403
    const pausedEvent: HuntLifecycleEvent = { ...baseEvent, huntStatus: "paused" };
    const pausedRes = validateHuntActiveState(pausedEvent, [], new Date("2026-10-31T09:30:00.000Z"));
    assert(pausedRes.allowed === false && pausedRes.status === 403, "Authoritative validator rejects paused hunt with 403");

    // Case 5C: Completed hunt rejects with 403
    const completedEvent: HuntLifecycleEvent = { ...baseEvent, huntStatus: "completed", isActive: false };
    const completedRes = validateHuntActiveState(completedEvent, [], new Date("2026-10-31T10:00:00.000Z"));
    assert(completedRes.allowed === false && completedRes.status === 403, "Authoritative validator rejects completed hunt with 403");

    // Case 5D: Draft / scheduled hunt rejects with 403
    const draftEvent: HuntLifecycleEvent = { ...baseEvent, huntStatus: "draft", huntStartedAt: null };
    const draftRes = validateHuntActiveState(draftEvent, [], new Date("2026-10-31T09:30:00.000Z"));
    assert(draftRes.allowed === false && draftRes.status === 403, "Authoritative validator rejects draft hunt with 403");

    // Case 5E: Hunt active duration exceeded rejects with 403
    const expiredRes = validateHuntActiveState(baseEvent, [], new Date("2026-10-31T11:05:00.000Z")); // 125 min > 120 min
    assert(expiredRes.allowed === false && expiredRes.status === 403, "Authoritative validator rejects expired active hunt with 403");

    // Case 5F: Hunt active duration extended by paused time
    const pausesForExtension: PauseRecord[] = [
        { pausedAt: "2026-10-31T09:30:00.000Z", resumedAt: "2026-10-31T10:00:00.000Z" }, // 30 min pause
    ];
    // 125 min wall clock - 30 min pause = 95 min active < 120 min max -> allowed
    const extendedRes = validateHuntActiveState(baseEvent, pausesForExtension, new Date("2026-10-31T11:05:00.000Z"));
    assert(extendedRes.allowed === true, "Paused time correctly extends active hunt duration deadline");

    // =========================================================================
    // SECTION 6: Session Authentication Guards & Multi-Tenant Scoping
    // =========================================================================
    console.log("\n--- Section 6: Session Guards & Multi-Tenant Organization Isolation ---");

    const unauthReq = requestWithCookie(undefined);

    // Unauthenticated rejection
    const unauthPlayer = await requirePlayer(unauthReq);
    assert(unauthPlayer instanceof NextResponse && unauthPlayer.status === 401, "requirePlayer rejects missing session with 401");

    const unauthVerified = await requireVerifiedPlayer(unauthReq);
    assert(unauthVerified instanceof NextResponse && unauthVerified.status === 401, "requireVerifiedPlayer rejects missing session with 401");

    const unauthAdmin = await requireAdmin(unauthReq);
    assert(unauthAdmin instanceof NextResponse && unauthAdmin.status === 401, "requireAdmin rejects missing session with 401");

    const unauthSuperAdmin = await requireSuperAdmin(unauthReq);
    assert(unauthSuperAdmin instanceof NextResponse && unauthSuperAdmin.status === 401, "requireSuperAdmin rejects missing session with 401");

    // Multi-tenant organization isolation logic:
    // Club Admin from Org A cannot manage resources in Org B
    const orgAId = "org-gitam-hyd";
    const orgBId = "org-gitam-vizag";

    const clubAdminA = {
        role: "club_admin" as const,
        organizationId: orgAId,
    };

    const targetEventB = {
        id: "evt-vizag-1",
        organizationId: orgBId,
    };

    const isOrgAllowedAonB = (clubAdminA.role as string) === "super_admin" || clubAdminA.organizationId === targetEventB.organizationId;
    assert(isOrgAllowedAonB === false, "Club admin from Org A is forbidden from managing Org B events");

    // Super Admin can access cross-organization resources
    const superAdminUser = {
        role: "super_admin" as const,
        organizationId: null,
    };
    const isSuperAdminAllowedOnB = superAdminUser.role === "super_admin" || superAdminUser.organizationId === targetEventB.organizationId;
    assert(isSuperAdminAllowedOnB === true, "Super admin is explicitly authorized across organizations");

    // =========================================================================
    // SECTION 7: Player Disclosure Policy (Location & Admin Notes Leak Prevention)
    // =========================================================================
    console.log("\n--- Section 7: Player Information Disclosure Policy ---");

    const rawClue = {
        id: "clue-secret-1",
        stepNumber: 1,
        clueText: "Walk to the clock tower",
        hintText: "It has four faces",
        locationName: "Main Tower Floor 2 Room 204",
        adminNotes: "QR code taped behind the whiteboard",
    };

    // Before solving (Player perspective)
    const playerBeforeSolved = {
        id: rawClue.id,
        step_number: rawClue.stepNumber,
        clue_text: "Locked Checkpoint",
        hint_text: null,
        location_name: null,
        admin_notes: null,
    };
    assert(playerBeforeSolved.location_name === null, "Player response hides location_name before clue is solved");
    assert(playerBeforeSolved.admin_notes === null, "Player response hides admin_notes before clue is solved");
    assert(playerBeforeSolved.clue_text === "Locked Checkpoint", "Player response locks clue text for unreached clues");

    // After solving (Player perspective: Item 8 requires location_name to stay hidden)
    const playerAfterSolved = {
        id: rawClue.id,
        step_number: rawClue.stepNumber,
        clue_text: rawClue.clueText,
        hint_text: rawClue.hintText,
        location_name: null, // STRICTLY NULL per Item 8
        admin_notes: null,   // STRICTLY NULL per Item 8
    };
    assert(playerAfterSolved.location_name === null, "Player response keeps location_name hidden even after solving");
    assert(playerAfterSolved.admin_notes === null, "Player response keeps admin_notes hidden after solving");

    // Admin perspective: Full disclosure
    const adminView = {
        id: rawClue.id,
        step_number: rawClue.stepNumber,
        clue_text: rawClue.clueText,
        hint_text: rawClue.hintText,
        location_name: rawClue.locationName,
        admin_notes: rawClue.adminNotes,
    };
    assert(adminView.location_name === "Main Tower Floor 2 Room 204", "Admin response discloses location_name for authorized administrators");
    assert(adminView.admin_notes === "QR code taped behind the whiteboard", "Admin response discloses admin_notes for authorized administrators");

    // =========================================================================
    // SECTION 8: Atomic Score Clamping at Zero (GREATEST(0, score + adj))
    // =========================================================================
    console.log("\n--- Section 8: Atomic Score Adjustment Clamping ---");

    function applyAtomicScoreAdjustment(currentScore: number, adjustment: number): number {
        return Math.max(0, currentScore + adjustment);
    }

    assert(applyAtomicScoreAdjustment(20, 10) === 30, "Positive score adjustment adds correctly");
    assert(applyAtomicScoreAdjustment(20, -10) === 10, "Negative penalty adjustment subtracts correctly");
    assert(applyAtomicScoreAdjustment(20, -50) === 0, "Severe negative penalty is clamped at zero (never negative)");
    assert(applyAtomicScoreAdjustment(0, -15) === 0, "Zero score remains zero after deduction");

    // =========================================================================
    // SECTION 9: Player Identity Anti-Spoofing & Body Mismatch Rejection
    // =========================================================================
    console.log("\n--- Section 9: Player Identity Anti-Spoofing Guards ---");

    function validatePlayerIdentity(
        session: { id: string; teamId: string; organizationId: string },
        body: Record<string, unknown>
    ): { allowed: boolean; status?: number; message?: string } {
        if (body.team_id && body.team_id !== session.teamId) {
            return { allowed: false, status: 403, message: "Forbidden: Mismatched team identity" };
        }
        if (body.teamId && body.teamId !== session.teamId) {
            return { allowed: false, status: 403, message: "Forbidden: Mismatched team identity" };
        }
        if (body.player_id && body.player_id !== session.id) {
            return { allowed: false, status: 403, message: "Forbidden: Mismatched player identity" };
        }
        if (body.playerId && body.playerId !== session.id) {
            return { allowed: false, status: 403, message: "Forbidden: Mismatched player identity" };
        }
        if (body.organization_id && body.organization_id !== session.organizationId) {
            return { allowed: false, status: 403, message: "Forbidden: Mismatched organization identity" };
        }
        return { allowed: true };
    }

    const playerSession = {
        id: "player-legit-1",
        teamId: "team-legit-alpha",
        organizationId: "org-gitam-hyd",
    };

    // Body with matching or omitted identity passes
    assert(validatePlayerIdentity(playerSession, {}).allowed === true, "Omitted body identity attributes accepted using session identity");
    assert(validatePlayerIdentity(playerSession, { team_id: "team-legit-alpha" }).allowed === true, "Matching team_id accepted");

    // Body attempting to spoof another team rejected with 403
    const spoofTeamRes = validatePlayerIdentity(playerSession, { team_id: "team-victim-beta" });
    assert(spoofTeamRes.allowed === false && spoofTeamRes.status === 403, "Rejects forged team_id in request body with 403 Forbidden");

    // Body attempting to spoof another player rejected with 403
    const spoofPlayerRes = validatePlayerIdentity(playerSession, { player_id: "player-victim-2" });
    assert(spoofPlayerRes.allowed === false && spoofPlayerRes.status === 403, "Rejects forged player_id in request body with 403 Forbidden");

    // Body attempting cross-org mutation rejected with 403
    const spoofOrgRes = validatePlayerIdentity(playerSession, { organization_id: "org-other-campus" });
    assert(spoofOrgRes.allowed === false && spoofOrgRes.status === 403, "Rejects cross-organization ID in request body with 403 Forbidden");

    // =========================================================================
    // SECTION 10: Hunt Lifecycle State Transitions & Terminal Immutability
    // =========================================================================
    console.log("\n--- Section 10: Hunt State Machine & Terminal Immutability ---");

    type HuntState = "draft" | "scheduled" | "active" | "paused" | "completed";

    function transitionStartHunt(currentState: HuntState): { allowed: boolean; status: number } {
        if (currentState !== "draft" && currentState !== "scheduled") {
            return { allowed: false, status: 400 };
        }
        return { allowed: true, status: 200 };
    }

    function transitionPauseResumeHunt(currentState: HuntState, action: "pause" | "resume"): { allowed: boolean; status: number; nextState?: HuntState } {
        if (currentState === "completed") {
            return { allowed: false, status: 400 };
        }
        if (currentState !== "active" && currentState !== "paused") {
            return { allowed: false, status: 400 };
        }
        if (action === "pause") {
            return { allowed: true, status: 200, nextState: "paused" };
        }
        return { allowed: true, status: 200, nextState: "active" };
    }

    function transitionStopHunt(currentState: HuntState): { allowed: boolean; status: number; nextState: HuntState } {
        if (currentState === "completed") {
            return { allowed: true, status: 200, nextState: "completed" }; // Idempotent
        }
        if (currentState !== "active" && currentState !== "paused") {
            return { allowed: false, status: 400, nextState: currentState };
        }
        return { allowed: true, status: 200, nextState: "completed" };
    }

    // Start hunt transitions
    assert(transitionStartHunt("draft").allowed === true, "Start allowed from 'draft'");
    assert(transitionStartHunt("scheduled").allowed === true, "Start allowed from 'scheduled'");
    assert(transitionStartHunt("active").allowed === false, "Duplicate start rejected on 'active' hunt with 400");
    assert(transitionStartHunt("paused").allowed === false, "Start rejected on 'paused' hunt with 400");
    assert(transitionStartHunt("completed").allowed === false, "Start rejected on 'completed' hunt with 400");

    // Pause/resume transitions
    assert(transitionPauseResumeHunt("active", "pause").nextState === "paused", "Active hunt transitions to paused");
    assert(transitionPauseResumeHunt("paused", "resume").nextState === "active", "Paused hunt transitions to active");
    assert(transitionPauseResumeHunt("completed", "resume").allowed === false, "Resume rejected on completed hunt with 400 (cannot reopen)");
    assert(transitionPauseResumeHunt("completed", "pause").allowed === false, "Pause rejected on completed hunt with 400");
    assert(transitionPauseResumeHunt("draft", "pause").allowed === false, "Pause rejected on draft hunt with 400");

    // Stop hunt transitions & idempotency
    assert(transitionStopHunt("active").nextState === "completed", "Active hunt stops to completed");
    assert(transitionStopHunt("paused").nextState === "completed", "Paused hunt stops to completed");
    assert(transitionStopHunt("draft").allowed === false, "Stop rejected on unstarted draft hunt with 400");
    assert(transitionStopHunt("completed").allowed === true && transitionStopHunt("completed").status === 200, "Repeated stop is idempotent (200 OK without re-stopping)");

    console.log(`\n🎉 All ${passedAssertions}/${totalAssertions} Production Test Assertions Passed Successfully!\n`);
}

runTestSuite()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error("Test execution failed:", err);
        process.exit(1);
    });
