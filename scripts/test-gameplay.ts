/**
 * HuntBase Gameplay Test Suite
 * Exercises production functions directly from src/lib/gameplay/ and src/lib/auth/
 */

// Ensure environment variable is defined before importing DB-dependent modules
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://mock:mock@localhost:5432/huntbase";

import { computeLeaderboard, RawTeamProgress } from "../src/lib/gameplay/leaderboard";
import { generateRoundRobinClueOrders } from "../src/lib/gameplay/clue-order";
import { requirePlayer, requireVerifiedPlayer, requireAdmin, requireSuperAdmin } from "../src/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exitCode = 1;
        throw new Error(message);
    }
    console.log(`✅ PASS: ${message}`);
}

async function runTests() {
    console.log("\n🧪 Running HuntBase Production Gameplay & Auth Tests...\n");

    // -------------------------------------------------------------
    // Test 1: Production Round-Robin Clue Ordering
    // -------------------------------------------------------------
    console.log("--- Test 1: Production Round-Robin Clue Assigner ---");
    const testTeams = ["team-alpha", "team-beta", "team-gamma", "team-delta"];
    const testClues = ["clue-1", "clue-2", "clue-3"];

    const assignments = generateRoundRobinClueOrders(testTeams, testClues);
    assert(assignments.length === testTeams.length * testClues.length, "Generated assignments match teams * clues");

    // Verify circular offset for starting clues
    const start0 = assignments.find((a) => a.team_id === "team-alpha" && a.step_index === 0)?.clue_id;
    const start1 = assignments.find((a) => a.team_id === "team-beta" && a.step_index === 0)?.clue_id;
    const start2 = assignments.find((a) => a.team_id === "team-gamma" && a.step_index === 0)?.clue_id;
    const start3 = assignments.find((a) => a.team_id === "team-delta" && a.step_index === 0)?.clue_id;

    assert(start0 === "clue-1", "Team 0 starts at Clue 1 (offset 0)");
    assert(start1 === "clue-2", "Team 1 starts at Clue 2 (offset 1)");
    assert(start2 === "clue-3", "Team 2 starts at Clue 3 (offset 2)");
    assert(start3 === "clue-1", "Team 3 wraps around to Clue 1 (offset 3 % 3 = 0)");

    // Verify all teams get every clue without duplicates
    testTeams.forEach((tId) => {
        const teamClueSet = new Set(assignments.filter((a) => a.team_id === tId).map((a) => a.clue_id));
        assert(teamClueSet.size === testClues.length, `Team ${tId} receives all unique clues with no duplicates`);
    });

    // -------------------------------------------------------------
    // Test 2: Production Leaderboard Ranking & Tie-Breakers
    // -------------------------------------------------------------
    console.log("\n--- Test 2: Production Leaderboard Engine & Deterministic Tie-Breakers ---");
    const huntStartTime = "2026-10-31T10:00:00.000Z";

    const mockTeams: RawTeamProgress[] = [
        {
            id: "t-fast-finish",
            team_name: "Speedy Hunters",
            score: 30,
            current_step: 3,
            is_disqualified: false,
            hunt_finished_at: "2026-10-31T10:25:00.000Z", // 25 min duration
            last_scan_at: "2026-10-31T10:25:00.000Z",
        },
        {
            id: "t-slow-finish",
            team_name: "Steady Solvers",
            score: 30,
            current_step: 3,
            is_disqualified: false,
            hunt_finished_at: "2026-10-31T10:45:00.000Z", // 45 min duration
            last_scan_at: "2026-10-31T10:45:00.000Z",
        },
        {
            id: "t-disqualified",
            team_name: "Rule Breakers",
            score: 50,
            current_step: 3,
            is_disqualified: true,
            hunt_finished_at: "2026-10-31T10:10:00.000Z",
            last_scan_at: "2026-10-31T10:10:00.000Z",
        },
        {
            id: "t-step2-early",
            team_name: "Early Scanners",
            score: 20,
            current_step: 2,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:10:00.000Z", // earlier scan
        },
        {
            id: "t-step2-late",
            team_name: "Late Scanners",
            score: 20,
            current_step: 2,
            is_disqualified: false,
            hunt_finished_at: null,
            last_scan_at: "2026-10-31T10:15:00.000Z",
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

    const ranked = computeLeaderboard(mockTeams, 3, huntStartTime);

    assert(ranked[0].team_id === "t-fast-finish", "Rank 1: Fastest finished team with 30 pts (25m duration)");
    assert(ranked[0].duration_formatted === "25m 00s", "Formatted duration is accurately calculated");
    assert(ranked[1].team_id === "t-slow-finish", "Rank 2: Slower completed team with 30 pts (45m duration)");
    assert(ranked[2].team_id === "t-step2-early", "Rank 3: Team with 20 pts & earlier scan timestamp");
    assert(ranked[3].team_id === "t-step2-late", "Rank 4: Team with 20 pts & later scan timestamp");
    assert(ranked[4].team_id === "t-step1", "Rank 5: Incomplete team with 10 pts");
    assert(ranked[5].team_id === "t-disqualified", "Rank 6: Disqualified team forced to bottom despite highest points");

    // -------------------------------------------------------------
    // Test 3: Session Authentication & Permission Guards
    // -------------------------------------------------------------
    console.log("\n--- Test 3: Session Authentication & Permission Guards ---");

    // Case A: Unauthenticated request to player endpoint
    const unauthReq = new NextRequest("http://localhost:3000/api/scan", {
        method: "POST",
    });
    const playerAuthRes = await requirePlayer(unauthReq);
    assert(playerAuthRes instanceof NextResponse && playerAuthRes.status === 401, "Rejects missing player session with 401 Unauthorized");

    // Case B: Unauthenticated request to verified player endpoint
    const verifiedAuthRes = await requireVerifiedPlayer(unauthReq);
    assert(verifiedAuthRes instanceof NextResponse && verifiedAuthRes.status === 401, "Rejects missing verified player session with 401 Unauthorized");

    // Case C: Unauthenticated request to admin endpoint
    const adminAuthRes = await requireAdmin(unauthReq);
    assert(adminAuthRes instanceof NextResponse && adminAuthRes.status === 401, "Rejects missing admin session with 401 Unauthorized");

    // Case D: Unauthenticated request to super-admin endpoint
    const superAdminAuthRes = await requireSuperAdmin(unauthReq);
    assert(superAdminAuthRes instanceof NextResponse && superAdminAuthRes.status === 401, "Rejects missing super-admin session with 401 Unauthorized");

    console.log("\n🎉 All 14/14 Gameplay & Auth Production Tests Passed Successfully!\n");
}

runTests()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error("Test execution failed:", err);
        process.exit(1);
    });
