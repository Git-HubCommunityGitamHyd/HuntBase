import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { generateQRToken } from "@/lib/utils/helpers";
import { getActiveAdminSession, getAdminOwnedEvent } from "@/lib/auth/server-session";

export async function POST(request: NextRequest) {
    try {
        const { event_id } = await request.json();

        if (!event_id) {
            return NextResponse.json(
                { success: false, message: "Event ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        if (!(await getAdminOwnedEvent(admin, event_id, supabase))) {
            return NextResponse.json({ success: false, message: "Event not found" }, { status: 404 });
        }

        // Get all clues for the event
        const { data: clues, error: cluesError } = await supabase
            .from("clues")
            .select("*")
            .eq("event_id", event_id)
            .order("step_number");

        if (cluesError || !clues || clues.length === 0) {
            return NextResponse.json(
                { success: false, message: "No clues found for this event" },
                { status: 404 }
            );
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const zip = new JSZip();
        const qrCodesToInsert = [];

        for (const clue of clues) {
            // Check if QR code already exists
            const { data: existingQR } = await supabase
                .from("qr_codes")
                .select("*")
                .eq("clue_id", clue.id)
                .eq("event_id", event_id)
                .maybeSingle();

            let qrToken: string;

            if (existingQR) {
                qrToken = existingQR.qr_token;
            } else {
                qrToken = generateQRToken();
                qrCodesToInsert.push({
                    event_id,
                    clue_id: clue.id,
                    qr_token: qrToken,
                });
            }

            // Generate QR code image
            const scanUrl = `${appUrl}/scan?token=${qrToken}`;
            const qrDataUrl = await QRCode.toDataURL(scanUrl, {
                width: 400,
                margin: 2,
                color: {
                    dark: "#1e1e2e",
                    light: "#ffffff",
                },
            });

            // Convert data URL to buffer
            const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
            const imageBuffer = Buffer.from(base64Data, "base64");

            // Add to zip
            const fileName = `clue_${clue.step_number.toString().padStart(2, "0")}_${(clue.location_name || "location").replace(/[^a-zA-Z0-9]/g, "_")}.png`;
            zip.file(fileName, imageBuffer);
        }

        // Insert new QR codes
        if (qrCodesToInsert.length > 0) {
            const { error: insertError } = await supabase
                .from("qr_codes")
                .insert(qrCodesToInsert);

            if (insertError) {
                console.error("QR insert error:", insertError);
                return NextResponse.json(
                    { success: false, message: "Failed to save QR codes" },
                    { status: 500 }
                );
            }
        }

        // Also generate QR codes for fake QRs
        const { data: fakeQRs } = await supabase
            .from("qr_codes")
            .select("*")
            .eq("event_id", event_id)
            .eq("is_fake", true);

        let fakeCount = 0;
        if (fakeQRs && fakeQRs.length > 0) {
            const fakeFolder = zip.folder("fake_qrs");
            for (const fakeQR of fakeQRs) {
                const scanUrl = `${appUrl}/scan?token=${fakeQR.qr_token}`;
                const qrDataUrl = await QRCode.toDataURL(scanUrl, {
                    width: 400,
                    margin: 2,
                    color: {
                        dark: "#dc2626", // Red color for fake QRs
                        light: "#ffffff",
                    },
                });

                const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
                const imageBuffer = Buffer.from(base64Data, "base64");

                const fileName = `FAKE_${(fakeQR.fake_label || "fake").replace(/[^a-zA-Z0-9]/g, "_")}.png`;
                fakeFolder?.file(fileName, imageBuffer);
                fakeCount++;
            }
        }

        // Generate zip file
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        const base64Zip = zipBuffer.toString("base64");

        return NextResponse.json({
            success: true,
            message: `Generated ${clues.length} clue QR codes${fakeCount > 0 ? ` and ${fakeCount} fake QR codes` : ""}`,
            zipBase64: base64Zip,
            clueCount: clues.length,
            fakeCount,
        });
    } catch (error) {
        console.error("QR generation error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred" },
            { status: 500 }
        );
    }
}
