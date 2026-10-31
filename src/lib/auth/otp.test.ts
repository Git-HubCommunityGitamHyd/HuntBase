import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGitamEmail } from "./otp";

test("normalizes valid addresses on the configured domain", () => {
  process.env.GITAM_EMAIL_DOMAIN = "student.gitam.edu";
  assert.equal(
    normalizeGitamEmail("  Ada.Lovelace+test@Student.GITAM.EDU "),
    "ada.lovelace+test@student.gitam.edu"
  );
});

test("rejects malformed local parts and non-matching domains", () => {
  process.env.GITAM_EMAIL_DOMAIN = "student.gitam.edu";
  for (const email of [
    ".student@student.gitam.edu",
    "student.@student.gitam.edu",
    "first..last@student.gitam.edu",
    "student@other.gitam.edu",
    "student@student.gitam.edu.example.com",
    "student@@student.gitam.edu",
  ]) {
    assert.equal(normalizeGitamEmail(email), null, email);
  }
});

test("rejects local parts longer than the email limit", () => {
  process.env.GITAM_EMAIL_DOMAIN = "student.gitam.edu";
  assert.equal(normalizeGitamEmail(`${"a".repeat(65)}@student.gitam.edu`), null);
});
