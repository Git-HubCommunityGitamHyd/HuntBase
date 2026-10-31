import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { clues, events, qrCodes } from "@/db/schema";
import { generateQRToken } from "@/lib/utils/helpers";
import { requireAdmin } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const clueId = request.nextUrl.searchParams.get("clue_id");
    if (!clueId) return NextResponse.json({ success: false, message: "Clue ID is required" }, { status: 400 });

    const [clue] = await db
      .select({ id: clues.id, eventId: clues.eventId, organizationId: events.organizationId })
      .from(clues)
      .innerJoin(events, eq(events.id, clues.eventId))
      .where(eq(clues.id, clueId))
      .limit(1);

    if (!clue) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });

    if (auth.role !== "super_admin" && auth.organizationId !== clue.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You do not have permission to view tokens for this event" },
        { status: 403 }
      );
    }

    const [existing] = await db.select({ qrToken: qrCodes.qrToken }).from(qrCodes).where(eq(qrCodes.clueId, clueId)).limit(1);
    return NextResponse.json({
      success: true,
      token: existing?.qrToken ?? generateQRToken(),
      exists: !!existing,
      message: existing ? undefined : "Preview token generated (not saved to database)",
    });
  } catch (error) {
    console.error("QR token error:", error);
    return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
  }
}
