import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/utils/helpers";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            club_name,
            slug,
            contact_email,
            full_name,
            username,
            password,
            description,
        } = body;

        // Basic validation
        if (!club_name || !slug || !contact_email || !full_name || !username || !password) {
            return NextResponse.json(
                { success: false, message: "All required fields must be filled" },
                { status: 400 }
            );
        }

        // Slug sanitization: lowercase, alphanumeric and hyphens only
        const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        if (cleanSlug.length < 3) {
            return NextResponse.json(
                { success: false, message: "Club slug must be at least 3 characters long" },
                { status: 400 }
            );
        }

        // Password length check
        if (password.length < 6) {
            return NextResponse.json(
                { success: false, message: "Password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Check if slug already exists
        const { data: existingOrg } = await supabase
            .from("organizations")
            .select("id")
            .eq("slug", cleanSlug)
            .maybeSingle();

        if (existingOrg) {
            return NextResponse.json(
                { success: false, message: "A club with this slug already exists. Please choose a different one." },
                { status: 409 }
            );
        }

        // 2. Check if username or email already exists in host_users
        const { data: existingUser } = await supabase
            .from("host_users")
            .select("id")
            .or(`username.eq.${username.trim()},email.eq.${contact_email.trim()}`)
            .maybeSingle();

        if (existingUser) {
            return NextResponse.json(
                { success: false, message: "An organizer with this username or email already exists" },
                { status: 409 }
            );
        }

        // 3. Create unverified organization
        const { data: newOrg, error: orgError } = await supabase
            .from("organizations")
            .insert({
                name: club_name.trim(),
                slug: cleanSlug,
                contact_email: contact_email.trim(),
                description: description ? description.trim() : null,
                is_verified: false, // Requires Super Admin approval!
            })
            .select()
            .single();

        if (orgError || !newOrg) {
            console.error("Organization creation error:", orgError);
            return NextResponse.json(
                { success: false, message: "Failed to register club organization" },
                { status: 500 }
            );
        }

        // 4. Create host user record
        const passwordHash = await hashPassword(password);
        const { error: userError } = await supabase
            .from("host_users")
            .insert({
                organization_id: newOrg.id,
                email: contact_email.trim(),
                username: username.trim(),
                password_hash: passwordHash,
                full_name: full_name.trim(),
                role: "club_admin",
                is_active: true,
            });

        if (userError) {
            console.error("Host user creation error:", userError);
            // Rollback organization
            await supabase.from("organizations").delete().eq("id", newOrg.id);
            return NextResponse.json(
                { success: false, message: "Failed to create organizer credentials" },
                { status: 500 }
            );
        }

        // 5. Seed default theme config
        await supabase.from("theme_configs").insert({
            organization_id: newOrg.id,
            preset: "cyber-matrix",
            primary_color: "#22c55e",
            accent_color: "#10b981",
            background_color: "#09090b",
            card_color: "#18181b",
            text_color: "#fafafa",
            border_radius: "0.5rem",
        });

        return NextResponse.json({
            success: true,
            message: "Club registration submitted successfully! Your application is pending review by the Super Admin.",
            club: {
                id: newOrg.id,
                name: newOrg.name,
                slug: newOrg.slug,
                is_verified: false,
            },
        });
    } catch (error) {
        console.error("Club registration error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error during registration" },
            { status: 500 }
        );
    }
}
