import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { hostUsers, organizations } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request);
    if (!session || session.kind !== "admin") {
      return NextResponse.json({ success: false, admin: null }, { status: 401 });
    }

    const [hostUser] = await db
      .select({
        id: hostUsers.id,
        organization_id: hostUsers.organizationId,
        email: hostUsers.email,
        username: hostUsers.username,
        full_name: hostUsers.fullName,
        role: hostUsers.role,
        is_active: hostUsers.isActive,
      })
      .from(hostUsers)
      .where(eq(hostUsers.id, session.id))
      .limit(1);

    if (!hostUser?.is_active) {
      return NextResponse.json({ success: false, admin: null }, { status: 401 });
    }

    const [organization] = hostUser.organization_id
      ? await db
          .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, logo_url: organizations.logoUrl })
          .from(organizations)
          .where(eq(organizations.id, hostUser.organization_id))
          .limit(1)
      : [];

    return NextResponse.json({
      success: true,
      admin: { ...hostUser, organization: organization ?? null, is_admin: true },
    });
  } catch (error) {
    console.error("Session verification error:", error);
    return NextResponse.json({ success: false, admin: null }, { status: 500 });
  }
}
