import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/utils/helpers";

// Strip ASCII control and NUL characters (0x00-0x1F, 0x7F)
function stripControlChars(val: unknown): string {
    if (typeof val !== "string") return "";
    return val.replace(/[\x00-\x1F\x7F]/g, "");
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            club_name,
            contact_email,
            full_name,
            username,
            password,
            description,
        } = body;

        const cleanClubName = stripControlChars(club_name).trim();
        const cleanEmail = stripControlChars(contact_email).trim();
        const cleanFullName = stripControlChars(full_name).trim();
        const cleanUsername = stripControlChars(username).trim();
        const cleanDescription = description ? stripControlChars(description).trim() : null;

        // Basic validation
        if (!cleanClubName || !cleanEmail || !cleanFullName || !cleanUsername || !password) {
            return NextResponse.json(
                { success: false, message: "All required fields must be filled" },
                { status: 400 }
            );
        }

        // Club name length check (max 100 chars)
        if (cleanClubName.length > 100) {
            return NextResponse.json(
                { success: false, message: "Club name must not exceed 100 characters" },
                { status: 400 }
            );
        }

        // Description length check (max 500 chars)
        if (cleanDescription && cleanDescription.length > 500) {
            return NextResponse.json(
                { success: false, message: "Description must not exceed 500 characters" },
                { status: 400 }
            );
        }

        // Username validation: max 30 chars, alphanumeric + underscore only
        if (cleanUsername.length > 30 || !/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
            return NextResponse.json(
                { success: false, message: "Username must be 30 characters or fewer and contain only alphanumeric characters and underscores" },
                { status: 400 }
            );
        }

        // Full name length check (max 100 chars)
        if (cleanFullName.length > 100) {
            return NextResponse.json(
                { success: false, message: "Full name must not exceed 100 characters" },
                { status: 400 }
            );
        }

        // Email validation & length limit (prevents PostgREST .or() injection)
        const emailRegex = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;
        if (!emailRegex.test(cleanEmail) || cleanEmail.length > 255) {
            return NextResponse.json(
                { success: false, message: "Invalid contact email address" },
                { status: 400 }
            );
        }

        // Password length check
        if (typeof password !== "string" || password.length < 6 || password.length > 128) {
            return NextResponse.json(
                { success: false, message: "Password must be between 6 and 128 characters long" },
                { status: 400 }
            );
        }

        const supabase = createAdminClient();

        // 1. Check if username or email already exists in host_users
        const { data: existingUser } = await supabase
            .from("host_users")
            .select("id")
            .or(`username.eq.${cleanUsername},email.eq.${cleanEmail}`)
            .maybeSingle();

        if (existingUser) {
            return NextResponse.json(
                { success: false, message: "An organizer with this username or email already exists" },
                { status: 409 }
            );
        }

        // 2. Generate a clean unique internal slug for database constraints
        const baseSlug = (body.slug ? stripControlChars(body.slug) : cleanClubName)
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "club";

        let cleanSlug = baseSlug;
        const { data: existingSlug } = await supabase
            .from("organizations")
            .select("id")
            .eq("slug", cleanSlug)
            .maybeSingle();

        if (existingSlug) {
            cleanSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
        }

        // 3. Create unverified organization
        const { data: newOrg, error: orgError } = await supabase
            .from("organizations")
            .insert({
                name: cleanClubName,
                slug: cleanSlug,
                contact_email: cleanEmail,
                description: cleanDescription,
                is_verified: false, // Requires Super Admin approval
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
                email: cleanEmail,
                username: cleanUsername,
                password_hash: passwordHash,
                full_name: cleanFullName,
                role: "club_admin",
                is_active: true,
            });

        if (userError) {
            console.error("Host user creation error:", userError);
            // Rollback organization creation
            await supabase.from("organizations").delete().eq("id", newOrg.id);
            return NextResponse.json(
                { success: false, message: "Failed to create organizer account" },
                { status: 500 }
            );
        }

        // 5. Initialize default theme config for this organization
        await supabase.from("theme_configs").insert({
            organization_id: newOrg.id,
            preset_id: "cyber-matrix",
            primary_color: "#22c55e",
            accent_color: "#10b981",
            background_color: "#0a0a0c",
            card_color: "#18181b",
            text_color: "#fafafa",
            border_radius: "0.5rem",
        });

        return NextResponse.json({
            success: true,
            message: "Club registration submitted successfully! Awaiting super admin review.",
            club: {
                id: newOrg.id,
                name: newOrg.name,
            },
        });
    } catch (error) {
        console.error("Club registration error:", error);
        return NextResponse.json(
            { success: false, message: "Internal server error" },
            { status: 500 }
        );
    }
}
