import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const N = 32768;
const R = 8;
const P = 3;
const KEYLEN = 64;
const OPTIONS = { N, r: R, p: P, maxmem: 128 * N * R * 2 };

// Stored format: scrypt$N$r$p$salt$hash
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, OPTIONS);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return verifyLegacySha256(password, stored);
  }
  const [, n, r, p, saltB64, hashB64] = parts;
  const cost = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (
    !Number.isSafeInteger(cost) || cost < 16_384 || (cost & (cost - 1)) !== 0 || cost > 65_536 ||
    !Number.isSafeInteger(blockSize) || blockSize < 1 || blockSize > 16 ||
    !Number.isSafeInteger(parallelization) || parallelization < 1 || parallelization > 4 ||
    salt.length < 16 || salt.length > 64 || expected.length < 32 || expected.length > 128
  ) return false;
  let actual: Buffer;
  try {
    actual = await scrypt(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 128 * cost * blockSize * 2,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verifyLegacySha256(password: string, stored: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(stored)) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = createHash("sha256").update(password, "utf8").digest();
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

// Legacy SHA-256 hashes remain valid until a successful login, when they are
// transparently upgraded to the salted scrypt format above.
export async function verifyPasswordAndUpgrade(
  password: string,
  stored: string
): Promise<{ valid: boolean; upgradedHash?: string }> {
  const valid = await verifyPassword(password, stored);
  if (!valid || stored.startsWith("scrypt$")) return { valid };
  return { valid, upgradedHash: await hashPassword(password) };
}
