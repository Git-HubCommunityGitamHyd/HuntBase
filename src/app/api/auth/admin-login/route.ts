import { eq, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { hostUsers, organizations } from "@/db/schema";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import { verifyPasswordAndUpgrade } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "Username and password required" },
        { status: 400 }
      );
    }

    const [hostUser] = await db
      .select()
      .from(hostUsers)
      .where(or(eq(sql`lower(${hostUsers.username})`, username), eq(sql`lower(${hostUsers.email})`, username)))
      .limit(1);

    if (!hostUser) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const passwordCheck = await verifyPasswordAndUpgrade(password, hostUser.passwordHash);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    if (!hostUser.isActive) {
      return NextResponse.json(
        { success: false, message: "Account is disabled. Contact super admin." },
        { status: 403 }
      );
    }

    await db.update(hostUsers).set({
      lastLoginAt: new Date(),
      ...(passwordCheck.upgradedHash ? { passwordHash: passwordCheck.upgradedHash } : {}),
    }).where(eq(hostUsers.id, hostUser.id));

    const [organization] = hostUser.organizationId
      ? await db
          .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, logo_url: organizations.logoUrl })
          .from(organizations)
          .where(eq(organizations.id, hostUser.organizationId))
          .limit(1)
      : [];

    const response = NextResponse.json({
      success: true,
      message: "Admin login successful",
      admin: {
        id: hostUser.id,
        organization_id: hostUser.organizationId,
        email: hostUser.email,
        username: hostUser.username,
        full_name: hostUser.fullName,
        role: hostUser.role,
        is_active: hostUser.isActive,
        organization: organization ?? null,
        is_admin: true,
      },
    });

    return setSessionCookie(response, await createSession({ hostUserId: hostUser.id }));
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, message: "An error occurred" },
      { status: 500 }
    );
  }
}
