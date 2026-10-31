import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";

const asApiClue = (row: typeof clues.$inferSelect) => ({
  id: row.id,
  event_id: row.eventId,
  step_number: row.stepNumber,
  clue_text: row.clueText,
  hint_text: row.hintText,
  location_name: row.locationName,
  admin_notes: row.adminNotes,
  created_at: row.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const eventId = request.nextUrl.searchParams.get("event_id");

    const query = db
      .select({ clue: clues })
      .from(clues)
      .innerJoin(events, eq(events.id, clues.eventId));

    const conditions = [];
    if (eventId) conditions.push(eq(clues.eventId, eventId));
    if (auth.role !== "super_admin") {
      conditions.push(eq(events.organizationId, auth.organizationId!));
    }

    const rows = await query
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(clues.stepNumber));

    return NextResponse.json({ success: true, data: rows.map(r => asApiClue(r.clue)) });
  } catch (error) {
    console.error("Clues fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch clues" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { event_id, step_number, clue_text, location_name, hint_text, admin_notes } = body;
    if (!event_id || !step_number || !clue_text) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }

    const [event] = await db
      .select({ organizationId: events.organizationId })
      .from(events)
      .where(eq(events.id, event_id))
      .limit(1);

    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    if (auth.role !== "super_admin" && event.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot add clues to another organization's event" },
        { status: 403 }
      );
    }

    const [row] = await db.insert(clues).values({
      eventId: event_id,
      stepNumber: Number(step_number),
      clueText: clue_text,
      locationName: location_name || null,
      hintText: hint_text || null,
      adminNotes: admin_notes || null,
    }).returning();

    return NextResponse.json({ success: true, data: asApiClue(row) });
  } catch (error) {
    console.error("Clue creation error:", error);
    return NextResponse.json({ success: false, message: "Failed to create clue" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { id, ...input } = body;
    if (!id) return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });

    const [clueWithEvent] = await db
      .select({ id: clues.id, organizationId: events.organizationId })
      .from(clues)
      .innerJoin(events, eq(events.id, clues.eventId))
      .where(eq(clues.id, id))
      .limit(1);

    if (!clueWithEvent) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });

    if (auth.role !== "super_admin" && clueWithEvent.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot modify clues for another organization" },
        { status: 403 }
      );
    }

    const values: Partial<typeof clues.$inferInsert> = {};
    if (input.step_number !== undefined) values.stepNumber = Number(input.step_number);
    if (input.clue_text !== undefined) values.clueText = input.clue_text;
    if (input.location_name !== undefined) values.locationName = input.location_name;
    if (input.hint_text !== undefined) values.hintText = input.hint_text;
    if (input.admin_notes !== undefined) values.adminNotes = input.admin_notes;

    await db.update(clues).set(values).where(eq(clues.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clue update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update clue" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "Clue ID required" }, { status: 400 });

    const [clueWithEvent] = await db
      .select({ id: clues.id, organizationId: events.organizationId })
      .from(clues)
      .innerJoin(events, eq(events.id, clues.eventId))
      .where(eq(clues.id, id))
      .limit(1);

    if (!clueWithEvent) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });

    if (auth.role !== "super_admin" && clueWithEvent.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You cannot delete clues for another organization" },
        { status: 403 }
      );
    }

    await db.delete(clues).where(eq(clues.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clue delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete clue" }, { status: 500 });
  }
}
