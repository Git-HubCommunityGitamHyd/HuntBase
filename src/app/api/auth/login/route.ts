import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyPassword } from "@/lib/utils/helpers";
import { setPlayerSessionCookie } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return NextResponse.json(
                { success: false, message: "Username and password required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // Find player by username in team_members table
        const { data: player, error: playerError } = await supabase
            .from("team_members")
            .select("id, player_name, username, team_id, password_hash")
            .eq("username", username.toLowerCase())
            .single();

        if (playerError || !player) {
            return NextResponse.json(
                { success: false, message: "Invalid username or password" },
                { status: 401 }
            );
        }

        // Verify password
        const isValid = await verifyPassword(password, player.password_hash);
        if (!isValid) {
            return NextResponse.json(
                { success: false, message: "Invalid username or password" },
                { status: 401 }
            );
        }

        // Get team info
        const { data: team, error: teamError } = await supabase
            .from("teams")
            .select("id, event_id, team_name, score, current_step, is_disqualified, hunt_finished_at, min_players, max_players, registration_status")
            .eq("id", player.team_id)
            .single();

        if (teamError || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        // Check if team is disqualified
        if (team.is_disqualified) {
            return NextResponse.json(
                { success: false, message: "Your team has been disqualified" },
                { status: 403 }
            );
        }

        // Check if the event is active
        const { data: event, error: eventError } = await supabase
            .from("events")
            .select("is_active, name")
            .eq("id", team.event_id)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { success: false, message: "Event not found" },
                { status: 404 }
            );
        }

        if (!event.is_active) {
            return NextResponse.json(
                { success: false, message: `The event "${event.name}" is not currently active` },
                { status: 403 }
            );
        }

        const safePlayer = {
            id: player.id,
            player_name: player.player_name,
            username: player.username,
            team_id: player.team_id,
        };
        const safeTeam = {
            id: team.id,
            event_id: team.event_id,
            team_name: team.team_name,
            score: team.score,
            current_step: team.current_step,
            is_disqualified: team.is_disqualified,
            hunt_finished_at: team.hunt_finished_at,
            min_players: team.min_players,
            max_players: team.max_players,
            registration_status: team.registration_status,
        };

        const response = NextResponse.json({
            success: true,
            message: "Login successful",
            player: safePlayer,
            team: safeTeam,
        });
        return setPlayerSessionCookie(response, {
            id: player.id,
            username: player.username,
            role: "player",
            team_id: team.id,
        });
    } catch (error) {
        console.error("Login error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred" },
            { status: 500 }
        );
    }
}
