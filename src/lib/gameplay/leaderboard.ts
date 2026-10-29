export interface RawTeamProgress {
    id: string;
    team_name: string;
    score: number;
    current_step: number;
    is_disqualified: boolean;
    hunt_finished_at: string | null;
    last_scan_at?: string | null;
}

export interface LeaderboardEntry {
    rank: number;
    team_id: string;
    team_name: string;
    score: number;
    current_step: number;
    total_clues: number;
    is_complete: boolean;
    is_disqualified: boolean;
    hunt_finished_at: string | null;
    duration_seconds: number | null;
    duration_formatted: string | null;
}

function formatDuration(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

/**
 * Computes deterministic competitive leaderboard rankings with tie-breakers:
 * 1. Disqualified teams always placed at bottom
 * 2. Score (Descending)
 * 3. Completion status (Completed teams outrank incomplete teams with identical scores)
 * 4. Completion speed (Duration in seconds from hunt start to finish, Ascending)
 * 5. Current step progression (Descending)
 * 6. Latest scan timestamp (Earlier check-in wins, Ascending)
 * 7. Alphabetical by team name (Ascending fallback)
 */
export function computeLeaderboard(
    teams: RawTeamProgress[],
    totalClues: number,
    huntStartedAt?: string | null
): LeaderboardEntry[] {
    const startTimeMs = huntStartedAt ? new Date(huntStartedAt).getTime() : null;

    const formattedTeams = teams.map((team) => {
        const isComplete = Boolean(
            team.hunt_finished_at || (totalClues > 0 && team.current_step >= totalClues)
        );

        let durationSeconds: number | null = null;
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
        // 1. Disqualified teams at the very end
        if (a.team.is_disqualified !== b.team.is_disqualified) {
            return a.team.is_disqualified ? 1 : -1;
        }

        // 2. Score descending
        if (b.team.score !== a.team.score) {
            return b.team.score - a.team.score;
        }

        // 3. Completed teams outrank incomplete teams
        if (a.isComplete !== b.isComplete) {
            return a.isComplete ? -1 : 1;
        }

        // 4. For completed teams: fastest duration wins
        if (a.isComplete && b.isComplete && a.durationSeconds !== null && b.durationSeconds !== null) {
            if (a.durationSeconds !== b.durationSeconds) {
                return a.durationSeconds - b.durationSeconds;
            }
        }

        // 5. Current step descending
        if (b.team.current_step !== a.team.current_step) {
            return b.team.current_step - a.team.current_step;
        }

        // 6. Earlier checkpoint scan wins
        if (a.lastScanTimeMs !== b.lastScanTimeMs) {
            return a.lastScanTimeMs - b.lastScanTimeMs;
        }

        // 7. Stable name sort
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
        duration_formatted: item.durationSeconds !== null ? formatDuration(item.durationSeconds) : null,
    }));
}
