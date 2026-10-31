import { count, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teamMembers, teams } from "@/db/schema";
import { hashPassword } from "@/lib/utils/helpers";

// POST - Register a new player
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team_id, player_name, username, password } = body;

    if (!team_id || !player_name || !username || !password) {
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 4) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    if (typeof username !== "string" || !/^[a-z0-9_]+$/.test(username)) {
      return NextResponse.json(
        {
          success: false,
          message: "Username can only contain lowercase letters, numbers, and underscores",
        },
        { status: 400 }
      );
    }

    if (typeof player_name !== "string" || !player_name.trim()) {
      return NextResponse.json(
        { success: false, message: "Player name is required" },
        { status: 400 }
      );
    }

    const result = await db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.username, username))
        .limit(1);

      if (existingUser) return { error: "Username already taken. Please choose another.", status: 400 };

      const [team] = await tx
        .select({
          id: teams.id,
          teamName: teams.teamName,
          maxPlayers: teams.maxPlayers,
          registrationStatus: teams.registrationStatus,
          eventId: events.id,
          eventIsActive: events.isActive,
        })
        .from(teams)
        .innerJoin(events, eq(events.id, teams.eventId))
        .where(eq(teams.id, team_id))
        .limit(1)
        .for("update", { of: teams });

      if (!team) return { error: "Team not found", status: 404 };
      if (!team.eventIsActive || team.registrationStatus !== "open") {
        return { error: "Registration is closed for this event", status: 400 };
      }

      const [{ memberCount }] = await tx
        .select({ memberCount: count() })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));

      if (memberCount >= team.maxPlayers) {
        await tx.update(teams).set({ registrationStatus: "full" }).where(eq(teams.id, team.id));
        return { error: "This team is already full", status: 400 };
      }

      const passwordHash = await hashPassword(password);
      const [newMember] = await tx
        .insert(teamMembers)
        .values({ teamId: team.id, playerName: player_name.trim(), username, passwordHash })
        .returning({ id: teamMembers.id, playerName: teamMembers.playerName, username: teamMembers.username });

      if (memberCount + 1 >= team.maxPlayers) {
        await tx.update(teams).set({ registrationStatus: "full" }).where(eq(teams.id, team.id));
      }

      return { team, newMember };
    });

    if ("error" in result) {
      return NextResponse.json(
        { success: false, message: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Registration successful!",
      data: {
        id: result.newMember.id,
        player_name: result.newMember.playerName,
        username: result.newMember.username,
        team_name: result.team.teamName,
      },
    });
  } catch (error) {
    // PostgreSQL unique violation (username taken by a concurrent registration).
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { success: false, message: "Username already taken. Please choose another." },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { success: false, message: "Registration failed. Please try again." },
      { status: 500 }
    );
  }
}
