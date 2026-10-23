import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
    try {
        const { token, team_id, player_id } = await request.json();

        if (!token || !team_id) {
            return NextResponse.json(
                { success: false, message: "Missing token or team_id" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Get team data
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("*")
            .eq("id", team_id)
            .single();

        if (teamError || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        // 2. Check if team is disqualified
        if (team.is_disqualified) {
            return NextResponse.json(
                { success: false, message: "Your team has been disqualified" },
                { status: 403 }
            );
        }

        // 3. Get event status
        const { data: event } = await supabase
            .from("events")
            .select("*")
            .eq("id", team.event_id)
            .single();

        if (!event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        // Check if event is active
        if (!event.is_active) {
            return NextResponse.json(
                { success: false, message: "This event is not currently active" },
                { status: 403 }
            );
        }

        // Check if hunt has been started by admin
        if (!event.hunt_started_at) {
            return NextResponse.json(
                { success: false, message: "The hunt hasn't been started yet. Wait for the organizer to start!" },
                { status: 403 }
            );
        }

        // Check if hunt timer has expired
        const huntStartTime = new Date(event.hunt_started_at).getTime();
        const huntDuration = (event.hunt_duration_minutes || 60) * 60 * 1000;
        const huntEndTime = huntStartTime + huntDuration;
        const now = Date.now();

        if (now > huntEndTime) {
            return NextResponse.json(
                { success: false, message: "Time's up! The hunt has ended." },
                { status: 403 }
            );
        }

        // Check event time window
        const eventStartTime = new Date(event.start_time);
        const eventEndTime = new Date(event.end_time);

        if (new Date() < eventStartTime) {
            return NextResponse.json(
                { success: false, message: "The event hasn't started yet" },
                { status: 403 }
            );
        }

        if (new Date() > eventEndTime) {
            return NextResponse.json(
                { success: false, message: "The event has ended" },
                { status: 403 }
            );
        }

        // 4. Look up QR code by token
        const cleanToken = token.trim();
        const { data: qrCode, error: qrError } = await supabase
            .from("qr_codes")
            .select("*, clue:clues(*)")
            .eq("qr_token", cleanToken)
            .eq("event_id", team.event_id)
            .single();

        if (qrError || !qrCode) {
            console.log("QR lookup failed:", { token: cleanToken, eventId: team.event_id, error: qrError?.message });
            return NextResponse.json(
                { success: false, message: "Invalid checkpoint QR code for this event" },
                { status: 400 }
            );
        }

        // 5. Handle fake QR codes (rickrolls, meme traps)
        if (qrCode.is_fake) {
            await supabase
                .from("fake_qr_scans")
                .insert({
                    organization_id: team.organization_id || null,
                    event_id: team.event_id,
                    qr_code_id: qrCode.id,
                    team_id: team_id,
                    player_id: player_id || null,
                });

            return NextResponse.json({
                success: false,
                message: "😈 Decoy Checkpoint! You scanned a decoy QR code!",
                isFake: true,
                redirect_url: qrCode.redirect_url,
                fake_label: qrCode.fake_label,
            });
        }

        // 6. Get the team's expected next clue from team_clue_order
        const { data: expectedClueOrder } = await supabase
            .from("team_clue_order")
            .select("id, clue_id, hint_viewed")
            .eq("team_id", team_id)
            .eq("step_index", team.current_step)
            .single();

        if (!expectedClueOrder) {
            return NextResponse.json(
                { success: false, message: "All clues have already been completed for your team!" },
                { status: 400 }
            );
        }

        // Verify this is the expected clue
        if (qrCode.clue_id !== expectedClueOrder.clue_id) {
            return NextResponse.json(
                { success: false, message: "Wrong checkpoint! This is not your team's assigned next clue." },
                { status: 400 }
            );
        }

        // 7. Check for duplicate scan
        const { data: existingScan } = await supabase
            .from("scans")
            .select("id")
            .eq("team_id", team_id)
            .eq("clue_id", qrCode.clue_id)
            .single();

        if (existingScan) {
            return NextResponse.json(
                { success: false, message: "Your team has already verified this clue!" },
                { status: 400 }
            );
        }

        // 8. Record valid scan
        const hintUsed = expectedClueOrder.hint_viewed === true;
        const pointsEarned = hintUsed ? 5 : 10;

        const { error: scanError } = await supabase
            .from("scans")
            .insert({
                organization_id: team.organization_id || null,
                event_id: team.event_id,
                team_id,
                clue_id: qrCode.clue_id,
                qr_code_id: qrCode.id,
                scanned_by: player_id || null,
                hint_was_used: hintUsed,
            });

        if (scanError) {
            console.error("Scan insert error:", scanError);
            return NextResponse.json(
                { success: false, message: "Failed to record checkpoint scan" },
                { status: 500 }
            );
        }

        // 9. Check total clues to determine completion
        const { count: totalClues } = await supabase
            .from("clues")
            .select("id", { count: "exact" })
            .eq("event_id", team.event_id);

        const newScore = team.score + pointsEarned;
        const newStep = team.current_step + 1;
        const isComplete = newStep >= (totalClues || 0);

        // 10. Update team record (including hunt_finished_at when complete)
        const updatePayload: Record<string, unknown> = {
            score: newScore,
            current_step: newStep,
        };

        if (isComplete) {
            updatePayload.hunt_finished_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
            .from("teams")
            .update(updatePayload)
            .eq("id", team_id);

        if (updateError) {
            console.error("Team update error:", updateError);
            return NextResponse.json(
                { success: false, message: "Failed to update team progress" },
                { status: 500 }
            );
        }

        const message = isComplete
            ? "🎉 Victory! Your team has solved all clues and finished the hunt!"
            : `Checkpoint Verified! +${pointsEarned} points${hintUsed ? " (hint used)" : ""}. Move to the next clue!`;

        return NextResponse.json({
            success: true,
            message,
            newScore,
            nextStep: newStep,
            isComplete,
            pointsEarned,
            hintUsed,
        });
    } catch (error) {
        console.error("Scan route error:", error);
        return NextResponse.json(
            { success: false, message: "An unexpected error occurred" },
            { status: 500 }
        );
    }
}
