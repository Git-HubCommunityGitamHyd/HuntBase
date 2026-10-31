import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events, teamMembers, teams } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { verifyPasswordAndUpgrade } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Username and password required" },
        { status: 400 }
      );
    }

    const [record] = await db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        playerName: teamMembers.playerName,
        username: teamMembers.username,
        passwordHash: teamMembers.passwordHash,
        createdAt: teamMembers.createdAt,
        isVerified: teamMembers.isVerified,
        teamName: teams.teamName,
        organizationId: teams.organizationId,
        eventId: teams.eventId,
        score: teams.score,
        isDisqualified: teams.isDisqualified,
        currentStep: teams.currentStep,
        minPlayers: teams.minPlayers,
        maxPlayers: teams.maxPlayers,
        registrationStatus: teams.registrationStatus,
        huntFinishedAt: teams.huntFinishedAt,
        eventName: events.name,
        eventIsActive: events.isActive,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .innerJoin(events, eq(events.id, teams.eventId))
      .where(eq(sql`lower(${teamMembers.username})`, username))
      .limit(1);

    if (!record) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }

    const passwordCheck = await verifyPasswordAndUpgrade(password, record.passwordHash);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, message: "Invalid username or password" },
        { status: 401 }
      );
    }
    if (passwordCheck.upgradedHash) {
      await db.update(teamMembers).set({ passwordHash: passwordCheck.upgradedHash }).where(eq(teamMembers.id, record.id));
    }

    if (record.isDisqualified) {
      return NextResponse.json(
        { success: false, message: "Your team has been disqualified" },
        { status: 403 }
      );
    }

    if (!record.eventIsActive) {
      return NextResponse.json(
        { success: false, message: `The event "${record.eventName}" is not currently active` },
        { status: 403 }
      );
    }

    const sessionToken = await createSession({ teamMemberId: record.id });
    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      player: {
        id: record.id,
        team_id: record.teamId,
        player_name: record.playerName,
        username: record.username,
        created_at: record.createdAt.toISOString(),
      },
      team: {
        id: record.teamId,
        organization_id: record.organizationId,
        event_id: record.eventId,
        team_name: record.teamName,
        username: null,
        password_hash: null,
        score: record.score,
        is_disqualified: record.isDisqualified,
        current_step: record.currentStep,
        is_admin: false,
        created_at: record.createdAt.toISOString(),
        min_players: record.minPlayers,
        max_players: record.maxPlayers,
        registration_status: record.registrationStatus,
        hunt_finished_at: record.huntFinishedAt?.toISOString() ?? null,
      },
    });

    return setSessionCookie(response, sessionToken);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, message: "An error occurred" },
      { status: 500 }
    );
  }
}
