import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  hashPassword,
  verifyPassword,
  verifyPasswordAndUpgrade,
} from "./password";

test("new password hashes use salted scrypt and verify successfully", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");

  assert.match(first, /^scrypt\$32768\$8\$3\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("legacy SHA-256 hashes verify and are upgraded to scrypt", async () => {
  const legacyHash = createHash("sha256").update("legacy password", "utf8").digest("hex");

  const result = await verifyPasswordAndUpgrade("legacy password", legacyHash);
  assert.equal(result.valid, true);
  assert.match(result.upgradedHash ?? "", /^scrypt\$/);
  assert.equal(await verifyPassword("legacy password", result.upgradedHash!), true);
  assert.deepEqual(await verifyPasswordAndUpgrade("wrong password", legacyHash), { valid: false });
});

test("malformed stored hashes fail closed", async () => {
  assert.equal(await verifyPassword("password", "scrypt$not-a-cost$8$3$a$b"), false);
  assert.equal(await verifyPassword("password", "not-a-supported-hash"), false);
});
