import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateQRToken } from "@/lib/utils/helpers";

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

        // Check if QR code already exists for this clue
        const { data: existingQR, error: fetchError } = await supabase
            .from("qr_codes")
            .select("qr_token")
            .eq("clue_id", clueId)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
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
