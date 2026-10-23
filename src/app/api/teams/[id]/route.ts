import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { success: false, message: "Team ID is required" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        const { data: team, error } = await supabase
            .from("teams")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !team) {
            return NextResponse.json(
                { success: false, message: "Team not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            team,
        });
    } catch (error) {
        console.error("Fetch team error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch team" },
            { status: 500 }
        );
    }
}
