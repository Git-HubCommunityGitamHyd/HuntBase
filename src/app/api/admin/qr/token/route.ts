import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateQRToken } from "@/lib/utils/helpers";
import { getActiveAdminSession, getAdminOwnedClue } from "@/lib/auth/server-session";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const clueId = searchParams.get("clue_id");

        if (!clueId) {
            return NextResponse.json(
                { success: false, message: "Clue ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();
        const admin = await getActiveAdminSession(request, supabase);
        if (!admin) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const clue = await getAdminOwnedClue(admin, clueId, supabase);
        if (!clue) return NextResponse.json({ success: false, message: "Clue not found" }, { status: 404 });

        // Check if QR code already exists for this clue
        const { data: existingQR, error: fetchError } = await supabase
            .from("qr_codes")
            .select("qr_token")
            .eq("clue_id", clueId)
            .eq("event_id", clue.event_id)
            .maybeSingle();

        if (fetchError) {
            console.error("Error fetching QR:", fetchError);
            return NextResponse.json(
                { success: false, message: "Failed to fetch QR code" },
                { status: 500 }
            );
        }

        if (existingQR) {
            return NextResponse.json({
                success: true,
                token: existingQR.qr_token,
                exists: true,
            });
        }

        // If no QR exists yet, generate a preview token (not saved to DB)
        const previewToken = generateQRToken();

        return NextResponse.json({
            success: true,
            token: previewToken,
            exists: false,
            message: "Preview token generated (not saved to database)",
        });
    } catch (error) {
        console.error("QR token error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred" },
            { status: 500 }
        );
    }
}
