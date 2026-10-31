import { NextRequest, NextResponse } from "next/server";
import { and, count, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailVerifications, teamMembers } from "@/db/schema";
import { requirePlayer } from "@/lib/auth/session";
import {
  OTP_MAX_SENDS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_SECONDS,
  allowedDomain,
  generateOtp,
  hashOtp,
  normalizeGitamEmail,
} from "@/lib/auth/otp";
import { sendOtpEmail } from "@/lib/email";

const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, message, ...extra }, { status });

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlayer(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const email = normalizeGitamEmail(body?.email);
    if (!email) return fail(400, `Enter your @${allowedDomain()} email address`);

    const [member] = await db
      .select({ isVerified: teamMembers.isVerified })
      .from(teamMembers)
      .where(eq(teamMembers.id, auth.id))
      .limit(1);
    if (!member) return fail(401, "Unauthorized");
    if (member.isVerified) return fail(400, "Your account is already verified");

    const [taken] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(sql`lower(${teamMembers.gitamEmail})`, email),
          eq(teamMembers.isVerified, true),
          ne(teamMembers.id, auth.id)
        )
      )
      .limit(1);
    if (taken) return fail(400, "This email is already linked to another account");

    // Rate limits: cooldown between sends, and a cap per hour.
    const [latest] = await db
      .select({ createdAt: emailVerifications.createdAt })
      .from(emailVerifications)
      .where(eq(emailVerifications.teamMemberId, auth.id))
      .orderBy(desc(emailVerifications.createdAt))
      .limit(1);
    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_RESEND_COOLDOWN_SECONDS) {
        return fail(429, "Please wait before requesting another code", {
          retry_after_seconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed),
        });
      }
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.teamMemberId, auth.id),
          gte(emailVerifications.createdAt, new Date(Date.now() - 60 * 60 * 1000))
        )
      );
    if (n >= OTP_MAX_SENDS_PER_HOUR) {
      return fail(429, "Too many codes requested. Try again later.");
    }

    const otp = generateOtp();
    await db.transaction(async (tx) => {
      // Cancel any earlier unused code, then store the new one.
      await tx
        .update(emailVerifications)
        .set({ consumedAt: new Date() })
        .where(
          and(eq(emailVerifications.teamMemberId, auth.id), isNull(emailVerifications.consumedAt))
        );
      await tx.insert(emailVerifications).values({
        teamMemberId: auth.id,
        email,
        otpHash: hashOtp(otp, auth.id, email),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      });
    });

    try {
      await sendOtpEmail(email, otp);
    } catch (err) {
      console.error("Verification email failed:", err);
      await db
        .update(emailVerifications)
        .set({ consumedAt: new Date() })
        .where(
          and(eq(emailVerifications.teamMemberId, auth.id), isNull(emailVerifications.consumedAt))
        );
      return fail(502, "Could not send the email. Please try again shortly.");
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent",
      expires_in_seconds: OTP_TTL_SECONDS,
      resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  } catch (error) {
    console.error("Verification send error:", error);
    return fail(500, "An error occurred");
  }
}