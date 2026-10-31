export interface PauseRecord {
    pausedAt: Date | string;
    resumedAt?: Date | string | null;
}

export interface HuntLifecycleEvent {
    id: string;
    isActive: boolean;
    huntStatus: string;
    startTime: Date;
    endTime: Date;
    huntStartedAt: Date | null;
    huntDurationMinutes: number;
}

export type HuntValidationResult =
    | { allowed: true }
    | { allowed: false; status: number; message: string };

/**
 * Calculates active elapsed time in milliseconds between two timestamps,
 * subtracting all completed and currently open pause intervals that overlap the window.
 */
export function calculateActiveElapsedTimeMs(
    start: Date | string | number,
    endOrNow: Date | string | number = new Date(),
    pauses: PauseRecord[] = []
): number {
    const startMs = new Date(start).getTime();
    const endMs = new Date(endOrNow).getTime();
    if (endMs <= startMs || isNaN(startMs) || isNaN(endMs)) return 0;

    let totalPausedMs = 0;
    for (const pause of pauses) {
        const pauseStart = new Date(pause.pausedAt).getTime();
        const pauseEnd = pause.resumedAt ? new Date(pause.resumedAt).getTime() : endMs;

        if (isNaN(pauseStart)) continue;

        // Calculate overlap between [startMs, endMs] and [pauseStart, pauseEnd]
        const overlapStart = Math.max(startMs, pauseStart);
        const overlapEnd = Math.min(endMs, isNaN(pauseEnd) ? endMs : pauseEnd);

        if (overlapEnd > overlapStart) {
            totalPausedMs += (overlapEnd - overlapStart);
        }
    }

    const rawElapsedMs = endMs - startMs;
    return Math.max(0, rawElapsedMs - totalPausedMs);
}

/**
 * Calculates active elapsed time on a specific clue in minutes, excluding paused periods.
 */
export function calculateClueActiveElapsedMinutes(
    clueStartedAt: Date | string | number,
    now: Date | string | number = new Date(),
    pauses: PauseRecord[] = []
): number {
    const activeMs = calculateActiveElapsedTimeMs(clueStartedAt, now, pauses);
    return activeMs / 60_000;
}

/**
 * Authoritative centralized validation for gameplay actions (scans, hint requests, clue starts).
 * Ensures finished, paused, unstarted, and expired hunts strictly reject state mutations.
 */
export function validateHuntActiveState(
    event: HuntLifecycleEvent,
    pauses: PauseRecord[] = [],
    now: Date = new Date()
): HuntValidationResult {
    if (event.huntStatus === "completed" || !event.isActive) {
        return {
            allowed: false,
            status: 403,
            message: "The hunt has concluded. Actions are no longer permitted.",
        };
    }

    if (event.huntStatus === "paused") {
        return {
            allowed: false,
            status: 403,
            message: "The hunt is currently paused by organizers.",
        };
    }

    if (event.huntStatus !== "active" || !event.huntStartedAt) {
        return {
            allowed: false,
            status: 403,
            message: "The hunt is not currently active.",
        };
    }

    if (now < event.startTime) {
        return {
            allowed: false,
            status: 403,
            message: "The event hasn't started yet.",
        };
    }

    if (now > event.endTime) {
        return {
            allowed: false,
            status: 403,
            message: "The event has ended.",
        };
    }

    // Calculate active duration excluding paused intervals
    const activeHuntElapsedMs = calculateActiveElapsedTimeMs(event.huntStartedAt, now, pauses);
    const maxDurationMs = event.huntDurationMinutes * 60_000;

    if (activeHuntElapsedMs > maxDurationMs) {
        return {
            allowed: false,
            status: 403,
            message: "Time's up! The hunt has ended.",
        };
    }

    return { allowed: true };
}
