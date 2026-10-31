import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications, teamMembers } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";
import { OTP_MAX_ATTEMPTS, otpMatches } from "@/lib/auth/otp";
import { isUniqueViolation } from "@/lib/db-errors";

type Outcome = {
  status: number;
  body: { success: boolean; message: string; attempts_left?: number };
};
const fail = (status: number, message: string, attempts_left?: number): Outcome => ({
  status,
  body: { success: false, message, ...(attempts_left !== undefined ? { attempts_left } : {}) },
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlayer(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { success: false, message: "Enter the 6-digit code" },
        { status: 400 }
      );
    }

    // Return results instead of throwing inside the transaction, so a wrong-guess
    // counter is saved instead of being rolled back.
    const outcome: Outcome = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(emailVerifications)
        .where(
          and(eq(emailVerifications.teamMemberId, auth.id), isNull(emailVerifications.consumedAt))
        )
        .for("update");

      if (!row) return fail(400, "No active code. Request a new one.");

      const markUsed = () =>
        tx
          .update(emailVerifications)
          .set({ consumedAt: new Date() })
          .where(eq(emailVerifications.id, row.id));

      if (row.expiresAt.getTime() <= Date.now()) {
        await markUsed();
        return fail(400, "That code has expired. Request a new one.");
      }
      if (row.attempts >= OTP_MAX_ATTEMPTS) {
        await markUsed();
        return fail(429, "Too many attempts. Request a new code.");
      }

      if (!otpMatches(code, auth.id, row.email, row.otpHash)) {
        const attempts = row.attempts + 1;
        const exhausted = attempts >= OTP_MAX_ATTEMPTS;
        await tx
          .update(emailVerifications)
          .set({ attempts, ...(exhausted ? { consumedAt: new Date() } : {}) })
          .where(eq(emailVerifications.id, row.id));
        return fail(
          400,
          exhausted ? "Too many incorrect attempts. Request a new code." : "Incorrect code.",
          Math.max(0, OTP_MAX_ATTEMPTS - attempts)
        );
      }

      await markUsed();
      await tx
        .update(teamMembers)
        .set({ gitamEmail: row.email, isVerified: true })
        .where(eq(teamMembers.id, auth.id));
      return { status: 200, body: { success: true, message: "Email verified" } };
    });

    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { success: false, message: "This email is already linked to another account" },
        { status: 400 }
      );
    }
    console.error("Verification confirm error:", error);
    return NextResponse.json({ success: false, message: "An error occurred" }, { status: 500 });
  }
}