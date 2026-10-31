import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { db } from "@/db";
import { clues, events, qrCodes } from "@/db/schema";
import { generateQRToken } from "@/lib/utils/helpers";
import { requireAdmin } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const { event_id } = body;
    if (!event_id) return NextResponse.json({ success: false, message: "Event ID is required" }, { status: 400 });

    const [event] = await db.select().from(events).where(eq(events.id, event_id)).limit(1);
    if (!event) return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });

    if (auth.role !== "super_admin" && auth.organizationId !== event.organizationId) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You do not have permission to manage this event" },
        { status: 403 }
      );
    }

    const clueRows = await db.select().from(clues).where(eq(clues.eventId, event_id)).orderBy(asc(clues.stepNumber));
    if (!clueRows.length) return NextResponse.json({ success: false, message: "No clues found for this event" }, { status: 404 });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const zip = new JSZip();
    const qrRows = await db.select().from(qrCodes).where(eq(qrCodes.eventId, event_id));
    const qrByClue = new Map(qrRows.filter(q => !q.isFake).map(q => [q.clueId, q]));

    for (const clue of clueRows) {
      let qr = qrByClue.get(clue.id);
      if (!qr) {
        const [created] = await db.insert(qrCodes).values({
          eventId: event_id,
          clueId: clue.id,
          qrToken: generateQRToken(),
        }).returning();
        qr = created;
      }
      const png = await QRCode.toBuffer(`${appUrl}/scan?token=${qr.qrToken}`, { width: 400, margin: 2, color: { dark: "#1e1e2e", light: "#ffffff" } });
      const fileName = `clue_${String(clue.stepNumber).padStart(2, "0")}_${(clue.locationName || "location").replace(/[^a-zA-Z0-9]/g, "_")}.png`;
      zip.file(fileName, png);
    }

    const fakeRows = qrRows.filter(q => q.isFake);
    if (fakeRows.length) {
      const folder = zip.folder("fake_qrs");
      for (const qr of fakeRows) {
        const png = await QRCode.toBuffer(`${appUrl}/scan?token=${qr.qrToken}`, { width: 400, margin: 2, color: { dark: "#dc2626", light: "#ffffff" } });
        folder?.file(`FAKE_${(qr.fakeLabel || "fake").replace(/[^a-zA-Z0-9]/g, "_")}.png`, png);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    return NextResponse.json({
      success: true,
      message: `Generated ${clueRows.length} clue QR codes${fakeRows.length ? ` and ${fakeRows.length} fake QR codes` : ""}`,
      zipBase64: zipBuffer.toString("base64"),
      clueCount: clueRows.length,
      fakeCount: fakeRows.length,
    });
  } catch (error) {
    console.error("QR generation error:", error);
    return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
  }
}
