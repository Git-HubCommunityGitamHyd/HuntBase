import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_SECONDS = 600; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_SENDS_PER_HOUR = 5;

export function allowedDomain(): string {
  return (process.env.GITAM_EMAIL_DOMAIN ?? "student.gitam.edu").toLowerCase();
}

// Returns the cleaned address, or null if it isn't an address on the allowed domain.
export function normalizeGitamEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain !== allowedDomain()) return null; // exact match, not "ends with"
  if (local.length > 64 || !/^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*$/.test(local)) return null;
  return email;
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function secret(): string {
  const s = process.env.OTP_SECRET;
  if (!s || s.length < 32) throw new Error("OTP_SECRET must be set (32+ characters)");
  return s;
}

export function hashOtp(otp: string, memberId: string, email: string): string {
  return createHmac("sha256", secret()).update(`${memberId}:${email}:${otp}`).digest("hex");
}

export function otpMatches(
  otp: string,
  memberId: string,
  email: string,
  storedHash: string
): boolean {
  const a = Buffer.from(hashOtp(otp, memberId, email));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
