import { asc, and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { qrCodes } from "@/db/schema";

const apiQr = (q: typeof qrCodes.$inferSelect) => ({
  id: q.id, event_id: q.eventId, clue_id: q.clueId, qr_token: q.qrToken,
  is_fake: q.isFake, redirect_url: q.redirectUrl, fake_label: q.fakeLabel,
  created_at: q.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  try {
    const eventId = request.nextUrl.searchParams.get("event_id");
    if (!eventId) return NextResponse.json({ success: false, message: "Event ID required" }, { status: 400 });
    const rows = await db.select().from(qrCodes).where(and(eq(qrCodes.eventId, eventId), eq(qrCodes.isFake, true))).orderBy(asc(qrCodes.createdAt));
    return NextResponse.json({ success: true, data: rows.map(apiQr) });
  } catch (error) {
    console.error("Fetch fake QRs error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch fake QR codes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { event_id, label, redirect_url } = await request.json();
    if (!event_id || !label || !redirect_url) return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    const qrToken = `FAKE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [row] = await db.insert(qrCodes).values({ eventId: event_id, qrToken, isFake: true, fakeLabel: label, redirectUrl: redirect_url }).returning();
    return NextResponse.json({ success: true, data: apiQr(row) });
  } catch (error) {
    console.error("Create fake QR error:", error);
    return NextResponse.json({ success: false, message: "Failed to create fake QR code" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, message: "QR code ID required" }, { status: 400 });
    await db.delete(qrCodes).where(and(eq(qrCodes.id, id), eq(qrCodes.isFake, true)));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete fake QR error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete fake QR code" }, { status: 500 });
  }
}
