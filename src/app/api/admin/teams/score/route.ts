import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getActiveAdminSession, getAdminOwnedTeam } from "@/lib/auth/server-session";
import { adjustedScore, isValidScoreAdjustment } from "@/lib/auth/admin-policy";

// POST - Adjust team score
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

        const { team_id, adjustment } = body as Record<string, unknown>;
        if (typeof team_id !== "string" || !team_id.trim()) {
            return NextResponse.json(
                { success: false, message: "Team ID is required" },
                { status: 400 }
            );
        }
        if (!isValidScoreAdjustment(adjustment)) {
            return NextResponse.json(
                { success: false, message: "Adjustment must be a multiple of 5" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const ownedTeam = await getAdminOwnedTeam(admin, team_id.trim(), supabase);
        if (!ownedTeam) {
            return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
        }

        let teamQuery = supabase
            .from("teams")
            .select("id, event_id, organization_id, score")
            .eq("id", ownedTeam.id)
            .eq("event_id", ownedTeam.event_id);
        teamQuery = ownedTeam.organization_id
            ? teamQuery.eq("organization_id", ownedTeam.organization_id)
            : teamQuery.is("organization_id", null);
        const { data: team, error: fetchError } = await teamQuery.maybeSingle();

        if (fetchError) {
            return NextResponse.json({ success: false, message: "Unable to read team score" }, { status: 503 });
        }
        if (!team) {
            return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 });
        }

        const newScore = adjustedScore(team.score, adjustment);
        if (newScore === null) {
            return NextResponse.json({ success: false, message: "Team score is invalid or out of range" }, { status: 409 });
        }

        // Compare-and-set on the score prevents concurrent updates from silently overwriting each other.
        let updateQuery = supabase
            .from("teams")
            .update({ score: newScore })
            .eq("id", ownedTeam.id)
            .eq("event_id", ownedTeam.event_id)
            .eq("score", team.score);
        updateQuery = ownedTeam.organization_id
            ? updateQuery.eq("organization_id", ownedTeam.organization_id)
            : updateQuery.is("organization_id", null);
        const { data: updatedTeam, error: updateError } = await updateQuery
            .select("id, score")
            .maybeSingle();

        if (updateError) {
            return NextResponse.json({ success: false, message: "Unable to update team score" }, { status: 503 });
        }
        if (!updatedTeam) {
            return NextResponse.json(
                { success: false, message: "Team score changed during this request. Please retry." },
                { status: 409 }
            );
        }
        if (updatedTeam.id !== ownedTeam.id || updatedTeam.score !== newScore) {
            return NextResponse.json({ success: false, message: "Unable to verify team score update" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: `Score adjusted by ${adjustment}`,
            new_score: newScore,
        });
    } catch {
        return NextResponse.json(
            { success: false, message: "Failed to adjust score" },
            { status: 500 }
        );
    }
}