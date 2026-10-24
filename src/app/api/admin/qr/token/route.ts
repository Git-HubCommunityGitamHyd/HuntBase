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

        // 1. Check if QR code already exists for this clue
        const { data: existingQR, error: fetchError } = await supabase
            .from("qr_codes")
            .select("qr_token")
            .eq("clue_id", clueId)
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

        // 2. Fetch clue to determine event and organization
        const { data: clue, error: clueError } = await supabase
            .from("clues")
            .select("id, event_id")
            .eq("id", clueId)
            .maybeSingle();

        if (clueError || !clue) {
            return NextResponse.json(
                { success: false, message: "Clue not found" },
                { status: 404 }
            );
        }

        const { data: event } = await supabase
            .from("events")
            .select("organization_id")
            .eq("id", clue.event_id)
            .maybeSingle();

        // 3. Generate and persist QR code immediately so preview QR is valid and scannable
        const token = generateQRToken();
        const { data: newQR, error: insertError } = await supabase
            .from("qr_codes")
            .insert({
                clue_id: clue.id,
                event_id: clue.event_id,
                organization_id: event?.organization_id || null,
                qr_token: token,
                is_fake: false,
            })
            .select("qr_token")
            .single();

        if (insertError || !newQR) {
            console.error("Error creating QR code:", insertError);
            return NextResponse.json(
                { success: false, message: "Failed to create QR code" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            token: newQR.qr_token,
            exists: true,
        });
    } catch (error) {
        console.error("QR token error:", error);
        return NextResponse.json(
            { success: false, message: "An error occurred" },
            { status: 500 }
        );
    }
}
