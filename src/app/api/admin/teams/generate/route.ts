import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generatePassword, generateUsername, hashPassword, shuffleArray } from "@/lib/utils/helpers";
import type { GeneratedTeamCredential } from "@/lib/types";
import { getActiveAdminSession, getAdminOwnedEvent } from "@/lib/auth/server-session";
import { isValidTeamGenerationCount } from "@/lib/auth/admin-policy";

interface ClueOrderInsert {
    team_id: string;
    clue_id: string;
    step_index: number;
}

interface TeamInsert {
    id: string;
    event_id: string;
    organization_id: string | null;
    team_name: string;
    username: string;
    password_hash: string;
    score: number;
    is_disqualified: boolean;
    current_step: number;
    is_admin: boolean;
}

export async function POST(request: NextRequest) {
    try {
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
        }
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
        }

        const { event_id, count, prefix } = body as Record<string, unknown>;
        if (typeof event_id !== "string" || !event_id.trim() || !isValidTeamGenerationCount(count)) {
            return NextResponse.json(
                { success: false, message: "Event ID and a count between 1 and 100 are required" },
                { status: 400 }
            );
        }
        if (prefix !== undefined && (typeof prefix !== "string" || prefix.trim().length > 8)) {
            return NextResponse.json({ success: false, message: "Prefix must be a string of at most 8 characters" }, { status: 400 });
        }

        const normalizedEventId = event_id.trim();
        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const authorizedEvent = await getAdminOwnedEvent(admin, normalizedEventId, supabase);
        if (!authorizedEvent) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

        let eventQuery = supabase
            .from("events")
            .select("id, name, organization_id")
            .eq("id", normalizedEventId);
        eventQuery = authorizedEvent.organization_id
            ? eventQuery.eq("organization_id", authorizedEvent.organization_id)
            : eventQuery.is("organization_id", null);
        const { data: event, error: eventError } = await eventQuery.maybeSingle();
        if (eventError || !event) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }

        const { data: clues, error: cluesError } = await supabase
            .from("clues")
            .select("id")
            .eq("event_id", event.id)
            .order("step_number");
        if (cluesError) {
            return NextResponse.json({ success: false, message: "Unable to load event clues" }, { status: 503 });
        }
        if (!clues?.length) {
            return NextResponse.json(
                { success: false, message: "No clues found for this event. Add clues first." },
                { status: 400 }
            );
        }

        const { count: existingCount, error: countError } = await supabase
            .from("teams")
            .select("id", { count: "exact", head: true })
            .eq("event_id", event.id)
            .eq("is_admin", false);
        if (countError || typeof existingCount !== "number" || !Number.isSafeInteger(existingCount) || existingCount < 0) {
            return NextResponse.json({ success: false, message: "Unable to count existing teams" }, { status: 503 });
        }

        const startNumber = existingCount + 1;
        const suppliedPrefix = typeof prefix === "string" ? prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
        const eventName = typeof event.name === "string" ? event.name : "";
        const eventPrefix = suppliedPrefix || eventName.substring(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!eventPrefix) {
            return NextResponse.json({ success: false, message: "Unable to derive a team username prefix" }, { status: 409 });
        }

        const credentials: GeneratedTeamCredential[] = [];
        const teamsToInsert: TeamInsert[] = [];
        const clueOrdersToInsert: ClueOrderInsert[] = [];
        const clueIds = clues.map((clue: { id: string }) => clue.id);

        for (let i = 0; i < count; i++) {
            const teamNumber = startNumber + i;
            const username = generateUsername(eventPrefix, teamNumber);
            const password = generatePassword(10);
            const passwordHash = await hashPassword(password);
            const teamId = crypto.randomUUID();

            teamsToInsert.push({
                id: teamId,
                event_id: event.id,
                organization_id: event.organization_id,
                team_name: `Team ${teamNumber}`,
                username,
                password_hash: passwordHash,
                score: 0,
                is_disqualified: false,
                current_step: 0,
                is_admin: false,
            });
            credentials.push({ team_name: `Team ${teamNumber}`, username, password });

            shuffleArray(clueIds).forEach((clueId: string, index: number) => {
                clueOrdersToInsert.push({ team_id: teamId, clue_id: clueId, step_index: index });
            });
        }

        const { error: teamInsertError } = await supabase.from("teams").insert(teamsToInsert);
        if (teamInsertError) {
            return NextResponse.json({ success: false, message: "Failed to create teams" }, { status: 500 });
        }

        const { error: clueOrderError } = await supabase.from("team_clue_order").insert(clueOrdersToInsert);
        if (clueOrderError) {
            return NextResponse.json(
                { success: false, message: "Teams were created, but clue assignments failed. Contact an administrator before retrying." },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: `Successfully created ${count} teams`, credentials });
    } catch {
        return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
    }
}