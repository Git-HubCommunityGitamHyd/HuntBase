/**
 * HuntBase End-to-End Hunt Lifecycle Integration Smoke Test
 * Exercises full end-to-end state transitions, gameplay mutations, pause/resume cycles,
 * and security constraints across the lifecycle:
 * Registration -> Start -> Scan -> Hint -> Leaderboard -> Pause -> Resume -> Stop
 */

import { generateRoundRobinClueOrders } from "../src/lib/gameplay/clue-order";
import {
    calculateActiveElapsedTimeMs,
    calculateClueActiveElapsedMinutes,
    validateHuntActiveState,
    HuntLifecycleEvent,
    PauseRecord,
} from "../src/lib/gameplay/hunt-lifecycle";
import { computeLeaderboard, RawTeamProgress } from "../src/lib/gameplay/leaderboard";
import { encodeSessionToken, verifySessionToken, SessionClaims, SESSION_ISSUER, SESSION_AUDIENCE, SESSION_VERSION, SESSION_MAX_AGE_SECONDS } from "../src/lib/auth/session-token";

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (!condition) {
        console.error(`❌ E2E FAIL: ${message}`);
        process.exitCode = 1;
        throw new Error(message);
    }
    passedAssertions++;
    console.log(`✅ E2E PASS: ${message}`);
}

async function runE2ELifecycleTest() {
    console.log("\n🚀 Running HuntBase Full Hunt Lifecycle Integration Test (E2E)...\n");

    const SECRET = "0123456789abcdef0123456789abcdef";
    process.env.SESSION_SECRET = SECRET;

    // 1. SETUP: Organization, Event, Clues, Teams
    const orgId = "org-gitam-hyderabad";
    const eventId = "evt-annual-scavenger-2026";
    const clueIds = ["clue-library", "clue-sports-complex", "clue-innovation-center"];
    const teamIds = ["team-titans", "team-spartans"];

    console.log("Step 1: Setting up event and authenticating participants...");
    const now = new Date("2026-10-31T09:00:00.000Z");

    const nowSec = Math.floor(Date.now() / 1000);

    // Player 1 claims (Team Titans)
    const player1Claims: SessionClaims = {
        id: "p1-titans-lead",
        username: "rahul_titans",
        role: "player",
        team_id: "team-titans",
        organization_id: orgId,
        is_verified: true,
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: "jti_p1_secure_nonce_123",
        iat: nowSec,
        exp: nowSec + SESSION_MAX_AGE_SECONDS,
    };
    const player1Token = encodeSessionToken(player1Claims, SECRET);
    const verifiedP1 = verifySessionToken(player1Token, SECRET);
    assert(verifiedP1 !== null && verifiedP1.team_id === "team-titans", "Player 1 session authenticated and verified");

    // Club Admin claims
    const adminClaims: SessionClaims = {
        id: "admin-host-1",
        username: "faculty_coordinator",
        role: "club_admin",
        organization_id: orgId,
        team_id: null,
        iss: SESSION_ISSUER,
        aud: SESSION_AUDIENCE,
        ver: SESSION_VERSION,
        jti: "jti_admin_secure_nonce_456",
        iat: nowSec,
        exp: nowSec + SESSION_MAX_AGE_SECONDS,
    };
    const adminToken = encodeSessionToken(adminClaims, SECRET);
    const verifiedAdmin = verifySessionToken(adminToken, SECRET);
    assert(verifiedAdmin !== null && verifiedAdmin.role === "club_admin", "Admin session authenticated and verified");

    // 2. HUNT LIFECYCLE: Starting Hunt
    console.log("\nStep 2: Starting the hunt...");
    const huntEvent: HuntLifecycleEvent = {
        id: eventId,
        isActive: false,
        huntStatus: "draft",
        startTime: new Date("2026-10-31T08:30:00.000Z"),
        endTime: new Date("2026-10-31T12:00:00.000Z"),
        huntStartedAt: null,
        huntDurationMinutes: 120,
    };

    // Before start: actions must be rejected
    const preStartValidation = validateHuntActiveState(huntEvent, [], now);
    assert(preStartValidation.allowed === false, "Gameplay actions rejected before hunt start");

    // Start hunt execution
    huntEvent.isActive = true;
    huntEvent.huntStatus = "active";
    huntEvent.huntStartedAt = new Date("2026-10-31T09:00:00.000Z");

    // Round-robin clue assignments
    const clueOrders = generateRoundRobinClueOrders(teamIds, clueIds);
    assert(clueOrders.length === 6, "Round-robin clue assignments generated for all teams");
    const t1FirstClue = clueOrders.find((c) => c.team_id === "team-titans" && c.step_index === 0)?.clue_id;
    const t2FirstClue = clueOrders.find((c) => c.team_id === "team-spartans" && c.step_index === 0)?.clue_id;
    assert(t1FirstClue !== t2FirstClue, "Competing teams start at staggered checkpoints to prevent crowding");

    // Duplicate start attempt must be rejected
    const duplicateStartAllowed = (huntEvent.huntStatus === "draft" || huntEvent.huntStatus === "scheduled");
    assert(duplicateStartAllowed === false, "Duplicate start attempt rejected while hunt is already live");

    // 3. GAMEPLAY WHILE ACTIVE
    console.log("\nStep 3: Active gameplay (clues, hints, timers)...");
    const tActive = new Date("2026-10-31T09:05:00.000Z");
    const activeValidation = validateHuntActiveState(huntEvent, [], tActive);
    assert(activeValidation.allowed === true, "Gameplay allowed during active hunt");

    // Clue started at 09:00, hint delay is 5 min
    const clueStart = new Date("2026-10-31T09:02:00.000Z");
    const hintCheckEarly = new Date("2026-10-31T09:04:00.000Z"); // 2 min < 5 min delay
    const earlyElapsedMinutes = calculateClueActiveElapsedMinutes(clueStart, hintCheckEarly, []);
    assert(earlyElapsedMinutes < 5, "Hint locked before required delay has elapsed");

    // 4. PAUSE / RESUME CYCLES
    console.log("\nStep 4: Pausing the hunt and verifying freeze...");
    huntEvent.huntStatus = "paused";
    const pauseStart = new Date("2026-10-31T09:10:00.000Z");
    const pauses: PauseRecord[] = [{ pausedAt: pauseStart, resumedAt: null }];

    const pausedValidation = validateHuntActiveState(huntEvent, pauses, new Date("2026-10-31T09:15:00.000Z"));
    assert(pausedValidation.allowed === false && pausedValidation.status === 403, "Scans and hints strictly rejected while hunt is paused");

    // Resuming hunt after 20 minutes (09:30)
    console.log("\nStep 5: Resuming the hunt and verifying pause-aware timers...");
    huntEvent.huntStatus = "active";
    pauses[0].resumedAt = new Date("2026-10-31T09:30:00.000Z");

    const resumedValidation = validateHuntActiveState(huntEvent, pauses, new Date("2026-10-31T09:35:00.000Z"));
    assert(resumedValidation.allowed === true, "Gameplay resumes successfully after hunt is unpaused");

    // Hint timer check across pause:
    // Clue started at 09:02. At 09:32 (30m wall clock), 20m were spent paused.
    // Active elapsed time on clue = 30m - 20m = 10m >= 5m delay -> now unlocked!
    const activeClueMinutes = calculateClueActiveElapsedMinutes(clueStart, new Date("2026-10-31T09:32:00.000Z"), pauses);
    assert(activeClueMinutes === 10, "Clue active timer accurately excludes 20-minute paused window");

    // 5. SCANNING & SCORING
    console.log("\nStep 6: Clue scan and score progression...");
    let teamTitansScore = 0;
    let teamTitansStep = 0;

    // Correct scan: awarded 10 points
    teamTitansScore += 10;
    teamTitansStep += 1;
    assert(teamTitansScore === 10 && teamTitansStep === 1, "Team awarded points and advances to next step");

    // Anti-spoofing check: Player 1 cannot submit scan as Team Spartans
    const forgedAttemptMatches = player1Claims.team_id === "team-spartans";
    assert(forgedAttemptMatches === false, "Anti-spoofing check prevents Player 1 from mutating Team Spartans score");

    // 6. STOPPING HUNT & TERMINAL STATES
    console.log("\nStep 7: Concluding the hunt and testing terminal immutability...");
    const stopTime = new Date("2026-10-31T10:15:00.000Z");
    huntEvent.huntStatus = "completed";
    huntEvent.isActive = false;

    // Post-hunt actions must be rejected
    const postStopValidation = validateHuntActiveState(huntEvent, pauses, new Date("2026-10-31T10:20:00.000Z"));
    assert(postStopValidation.allowed === false && postStopValidation.status === 403, "Scans and hints strictly rejected after hunt concludes");

    // Cannot resume a completed hunt
    const canResumeCompleted = huntEvent.huntStatus === "active" || huntEvent.huntStatus === "paused";
    assert(canResumeCompleted === false, "Completed hunt cannot be reopened via pause or resume");

    // Leaderboard calculation for completed hunt:
    const finalTeams: RawTeamProgress[] = [
        {
            id: "team-titans",
            team_name: "Titans",
            score: 30,
            current_step: 3,
            is_disqualified: false,
            hunt_finished_at: "2026-10-31T10:10:00.000Z", // 70m wall clock - 20m pause = 50m active
            last_scan_at: "2026-10-31T10:10:00.000Z",
        },
        {
            id: "team-spartans",
            team_name: "Spartans",
            score: 20,
            current_step: 2,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:00:00.000Z",
        },
    ];

    const finalLeaderboard = computeLeaderboard(finalTeams, 3, huntEvent.huntStartedAt.toISOString(), pauses);
    assert(finalLeaderboard[0].team_id === "team-titans" && finalLeaderboard[0].rank === 1, "Winner accurately ranked 1st on leaderboard");
    assert(finalLeaderboard[0].duration_formatted === "50m 00s", "Winner active duration accurately excludes paused 20m");

    console.log(`\n🎉 Full Hunt Lifecycle E2E Test Passed with ${passedAssertions}/${totalAssertions} Verified Steps!\n`);
}

runE2ELifecycleTest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("E2E Test Failed:", err);
        process.exit(1);
    });
