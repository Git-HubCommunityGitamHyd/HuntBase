import { NextRequest, NextResponse } from "next/server";
import { getActiveAdminSession } from "@/lib/auth/server-session";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const supabase = createAdminClient();
        const session = await getActiveAdminSession(request, supabase);
        if (!session) {
            return NextResponse.json({ success: false, admin: null }, { status: 401 });
        }

        // 1. Check host_users
        const { data: hostUser } = await supabase
            .from("host_users")
            .select("id, organization_id, email, username, full_name, role, is_active")
            .eq("id", session.id)
            .maybeSingle();

        if (
            hostUser?.is_active === true &&
            hostUser.role === session.role &&
            (hostUser.organization_id ?? undefined) === session.organization_id
        ) {
            const { data: org } = await supabase
                .from("organizations")
                .select("id, name, slug, logo_url")
                .eq("id", hostUser.organization_id)
                .maybeSingle();

            return NextResponse.json({
                success: true,
                admin: {
                    ...hostUser,
                    organization: org || null,
                    is_admin: true,
                },
            });
        }

        // 2. Check legacy admin in teams
        const { data: legacyAdmin } = await supabase
            .from("teams")
            .select("id, team_name, username, is_admin, organization_id")
            .eq("id", session.id)
            .eq("is_admin", true)
            .maybeSingle();

        if (
            legacyAdmin?.is_admin && session.role === "club_admin" &&
            legacyAdmin.organization_id === session.organization_id
        ) {
            return NextResponse.json({
                success: true,
                admin: {
                    ...legacyAdmin,
                    role: session.role,
                    is_admin: true,
                },
            });
        }

        return NextResponse.json({ success: false, admin: null }, { status: 401 });
    } catch (error) {
        console.error("Session verification error:", error);
        return NextResponse.json({ success: false, admin: null }, { status: 500 });
    }
}
