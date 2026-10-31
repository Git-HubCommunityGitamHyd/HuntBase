import { and, desc, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

const apiEvent = (e: typeof events.$inferSelect) => ({
  id: e.id,
  organization_id: e.organizationId,
  name: e.name,
  start_time: e.startTime.toISOString(),
  end_time: e.endTime.toISOString(),
  is_active: e.isActive,
  hunt_status: e.huntStatus,
  hunt_started_at: e.huntStartedAt?.toISOString() ?? null,
  hunt_ended_at: e.huntEndedAt?.toISOString() ?? null,
  hunt_duration_minutes: e.huntDurationMinutes,
  hint_delay_minutes: e.hintDelayMinutes,
  default_min_players: e.defaultMinPlayers,
  default_max_players: e.defaultMaxPlayers,
  created_at: e.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    // High-priority Issue 5: Organization isolation
    const query = db.select().from(events);
    const rows = auth.role === "super_admin"
      ? await query.orderBy(desc(events.createdAt))
      : await query.where(eq(events.organizationId, auth.organizationId!)).orderBy(desc(events.createdAt));

    return NextResponse.json({ success: true, data: rows.map(apiEvent) });
  } catch (error) {
    console.error("Events fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { name, start_time, end_time } = body;
    if (!name || !start_time || !end_time) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const organizationId = auth.role === "super_admin" && body.organization_id
      ? body.organization_id
      : auth.organizationId;

    if (!organizationId) {
      return NextResponse.json({ success: false, message: "An organization is required to create an event" }, { status: 400 });
    }

    const [existing] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.name, name), eq(events.organizationId, organizationId)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ success: false, message: "An event with this name already exists in this organization" }, { status: 400 });
    }

    const [row] = await db.insert(events).values({
      organizationId,
      name,
      startTime: new Date(start_time),
      endTime: new Date(end_time),
      huntDurationMinutes: body.hunt_duration_minutes ?? 60,
      hintDelayMinutes: body.hint_delay_minutes ?? 5,
    }).returning();

    return NextResponse.json({ success: true, data: apiEvent(row) });
  } catch (error) {
    console.error("Event creation error:", error);
    return NextResponse.json({ success: false, message: "Failed to create event" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });

    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    // Enforce tenant boundary
    if (auth.role !== "super_admin" && existing.organizationId !== auth.organizationId) {
      return NextResponse.json({ success: false, message: "Forbidden: You cannot modify events from another organization" }, { status: 403 });
    }

    const values: Partial<typeof events.$inferInsert> = {};
    if (updates.name !== undefined) values.name = updates.name;
    if (updates.start_time !== undefined) values.startTime = new Date(updates.start_time);
    if (updates.end_time !== undefined) values.endTime = new Date(updates.end_time);
    if (updates.is_active !== undefined) values.isActive = updates.is_active;
    if (updates.hunt_status !== undefined) values.huntStatus = updates.hunt_status;
    if (updates.hunt_started_at !== undefined) values.huntStartedAt = updates.hunt_started_at ? new Date(updates.hunt_started_at) : null;
    if (updates.hunt_ended_at !== undefined) values.huntEndedAt = updates.hunt_ended_at ? new Date(updates.hunt_ended_at) : null;
    if (updates.hunt_duration_minutes !== undefined) values.huntDurationMinutes = updates.hunt_duration_minutes;
    if (updates.hint_delay_minutes !== undefined) values.hintDelayMinutes = updates.hint_delay_minutes;
    if (updates.default_min_players !== undefined) values.defaultMinPlayers = updates.default_min_players;
    if (updates.default_max_players !== undefined) values.defaultMaxPlayers = updates.default_max_players;

    await db.transaction(async (tx) => {
      if (updates.is_active === true) {
        await tx.update(events).set({ isActive: false }).where(and(eq(events.organizationId, existing.organizationId), ne(events.id, id)));
      }
      await tx.update(events).set(values).where(eq(events.id, id));
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Event update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update event" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });

    const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    // Enforce tenant boundary
    if (auth.role !== "super_admin" && existing.organizationId !== auth.organizationId) {
      return NextResponse.json({ success: false, message: "Forbidden: You cannot delete events from another organization" }, { status: 403 });
    }

    await db.delete(events).where(eq(events.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Event delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete event" }, { status: 500 });
  }
}
