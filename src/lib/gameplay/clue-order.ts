import { shuffleArray } from "@/lib/utils/helpers";

export interface ClueAssignment {
    team_id: string;
    clue_id: string;
    step_index: number;
}

/**
 * Generates an anti-crowding round-robin clue sequence for all teams.
 * - Team 0 starts at clue 0, Team 1 starts at clue 1, etc. (modulo total clues)
 * - The remaining clues are shuffled per team so routes diverge across campus
 */
export function generateRoundRobinClueOrders(
    teamIds: string[],
    clueIds: string[]
): ClueAssignment[] {
    if (!teamIds.length || !clueIds.length) {
        return [];
    }

    const assignments: ClueAssignment[] = [];
    const totalClues = clueIds.length;

    for (let teamIndex = 0; teamIndex < teamIds.length; teamIndex++) {
        const teamId = teamIds[teamIndex];
        const startOffset = teamIndex % totalClues;

        // Circular rotation to establish the starting clue
        const rotatedClues = [
            ...clueIds.slice(startOffset),
            ...clueIds.slice(0, startOffset),
        ];

        // Keep the starting clue fixed to guarantee distributed physical origins,
        // and randomly shuffle the remaining clues to scatter paths
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
