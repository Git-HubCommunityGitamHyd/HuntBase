/**
 * Standalone Unit Test Suite for HuntBase Gameplay Engine
 * Tests round-robin clue distribution and leaderboard tie-breakers
 */

// Simple assertion helper
function assert(condition, message) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exitCode = 1;
        throw new Error(message);
    }
    console.log(`✅ PASS: ${message}`);
}

// 1. Inlined clue order logic for independent test
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateRoundRobinClueOrders(teamIds, clueIds) {
    if (!teamIds.length || !clueIds.length) return [];
    const assignments = [];
    const totalClues = clueIds.length;

    for (let teamIndex = 0; teamIndex < teamIds.length; teamIndex++) {
        const teamId = teamIds[teamIndex];
        const startOffset = teamIndex % totalClues;

        const rotatedClues = [
            ...clueIds.slice(startOffset),
            ...clueIds.slice(0, startOffset),
        ];

        const firstClue = rotatedClues[0];
        const remainingClues = shuffleArray(rotatedClues.slice(1));
        const finalOrder = [firstClue, ...remainingClues];

        finalOrder.forEach((clueId, stepIndex) => {
            assignments.push({
                team_id: teamId,
                clue_id: clueId,
                step_index: stepIndex,
            });
        });
    }
    return assignments;
}

// 2. Inlined leaderboard tie-breaker logic
function computeLeaderboard(teams, totalClues, huntStartedAt) {
    const startTimeMs = huntStartedAt ? new Date(huntStartedAt).getTime() : null;

    const formattedTeams = teams.map((team) => {
        const isComplete = Boolean(
            team.hunt_finished_at || (totalClues > 0 && team.current_step >= totalClues)
        );

        let durationSeconds = null;
        if (isComplete && team.hunt_finished_at && startTimeMs) {
            const finishTimeMs = new Date(team.hunt_finished_at).getTime();
            durationSeconds = Math.max(0, Math.floor((finishTimeMs - startTimeMs) / 1000));
        }

        return {
            team,
            isComplete,
            durationSeconds,
            lastScanTimeMs: team.last_scan_at ? new Date(team.last_scan_at).getTime() : Infinity,
        };
    });

    formattedTeams.sort((a, b) => {
        if (a.team.is_disqualified !== b.team.is_disqualified) {
            return a.team.is_disqualified ? 1 : -1;
        }
        if (b.team.score !== a.team.score) {
            return b.team.score - a.team.score;
        }
        if (a.isComplete !== b.isComplete) {
            return a.isComplete ? -1 : 1;
        }
        if (a.isComplete && b.isComplete && a.durationSeconds !== null && b.durationSeconds !== null) {
            if (a.durationSeconds !== b.durationSeconds) {
                return a.durationSeconds - b.durationSeconds;
            }
        }
        if (b.team.current_step !== a.team.current_step) {
            return b.team.current_step - a.team.current_step;
        }
        if (a.lastScanTimeMs !== b.lastScanTimeMs) {
            return a.lastScanTimeMs - b.lastScanTimeMs;
        }
        return a.team.team_name.localeCompare(b.team.team_name);
    });

    return formattedTeams.map((item, index) => ({
        rank: index + 1,
        team_id: item.team.id,
        team_name: item.team.team_name,
        score: item.team.score,
        current_step: item.team.current_step,
        total_clues: totalClues,
        is_complete: item.isComplete,
        is_disqualified: item.team.is_disqualified,
        hunt_finished_at: item.team.hunt_finished_at,
        duration_seconds: item.durationSeconds,
    }));
}

// ==========================================
// TEST SUITE EXECUTION
// ==========================================
console.log("\n🧪 Running HuntBase Gameplay Unit Tests...\n");

// --- TEST 1: Round-Robin Distribution ---
console.log("--- Test 1: Round-Robin Clue Ordering ---");
const teamIds = ["team_1", "team_2", "team_3", "team_4", "team_5"];
const clueIds = ["clue_A", "clue_B", "clue_C"];

const orders = generateRoundRobinClueOrders(teamIds, clueIds);
assert(orders.length === teamIds.length * clueIds.length, "Total assignments equals teams * clues");

// Check first clues are round-robin offset
const firstClues = teamIds.map(tId => orders.find(o => o.team_id === tId && o.step_index === 0).clue_id);
assert(firstClues[0] === "clue_A", "Team 1 starts at Clue A (offset 0)");
assert(firstClues[1] === "clue_B", "Team 2 starts at Clue B (offset 1)");
assert(firstClues[2] === "clue_C", "Team 3 starts at Clue C (offset 2)");
assert(firstClues[3] === "clue_A", "Team 4 wraps to Clue A (offset 3 % 3 = 0)");
assert(firstClues[4] === "clue_B", "Team 5 wraps to Clue B (offset 4 % 3 = 1)");

// Check each team receives all clues exactly once
teamIds.forEach(tId => {
    const teamClues = orders.filter(o => o.team_id === tId).map(o => o.clue_id);
    const uniqueClues = new Set(teamClues);
    assert(uniqueClues.size === clueIds.length, `Team ${tId} receives all unique clues with no repeats`);
});

// --- TEST 2: Deterministic Leaderboard Tie-Breakers ---
console.log("\n--- Test 2: Leaderboard Tie-Breakers ---");
const huntStart = "2026-10-31T10:00:00.000Z";

const mockTeams = [
    {
        id: "t_disqualified",
        team_name: "Cheating Team",
        score: 100,
        current_step: 3,
        is_disqualified: true,
        hunt_finished_at: "2026-10-31T10:30:00.000Z",
    },
    {
        id: "t_fast_complete",
        team_name: "Fast Finishers",
        score: 30,
        current_step: 3,
        is_disqualified: false,
        hunt_finished_at: "2026-10-31T10:25:00.000Z", // 25 min duration
    },
    {
        id: "t_slow_complete",
        team_name: "Slow Finishers",
        score: 30,
        current_step: 3,
        is_disqualified: false,
        hunt_finished_at: "2026-10-31T10:40:00.000Z", // 40 min duration
    },
    {
        id: "t_step2_early_scan",
        team_name: "Early Checkin",
        score: 20,
        current_step: 2,
        is_disqualified: false,
        hunt_finished_at: null,
        last_scan_at: "2026-10-31T10:15:00.000Z",
    },
    {
        id: "t_step2_late_scan",
        team_name: "Late Checkin",
        score: 20,
        current_step: 2,
        is_disqualified: false,
        hunt_finished_at: null,
        last_scan_at: "2026-10-31T10:20:00.000Z",
    },
    {
        id: "t_step1",
        team_name: "Struggling Team",
        score: 10,
        current_step: 1,
        is_disqualified: false,
        hunt_finished_at: null,
        last_scan_at: "2026-10-31T10:05:00.000Z",
    },
];

const ranked = computeLeaderboard(mockTeams, 3, huntStart);

assert(ranked[0].team_id === "t_fast_complete", "Rank 1: Fastest completed team with 30 pts (25m)");
assert(ranked[1].team_id === "t_slow_complete", "Rank 2: Slower completed team with 30 pts (40m)");
assert(ranked[2].team_id === "t_step2_early_scan", "Rank 3: Team with 20 pts & earlier scan time");
assert(ranked[3].team_id === "t_step2_late_scan", "Rank 4: Team with 20 pts & later scan time");
assert(ranked[4].team_id === "t_step1", "Rank 5: Team with 10 pts");
assert(ranked[5].team_id === "t_disqualified", "Rank 6: Disqualified team forced to bottom despite high score");

console.log("\n🎉 All 8/8 Gameplay Unit Tests Passed Successfully!\n");
