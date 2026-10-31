import assert from "node:assert/strict";
import test from "node:test";
import { sendOtpEmail } from "./email";

test("email provider requests use a timeout signal", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  let receivedSignal: AbortSignal | null | undefined;
  process.env.RESEND_API_KEY = "test-api-key";
  process.env.EMAIL_FROM = "HuntBase <noreply@example.com>";
  globalThis.fetch = async (_input, init) => {
    receivedSignal = init?.signal;
    return new Response(null, { status: 202 });
  };

  try {
    await sendOtpEmail("player@student.gitam.edu", "123456");
    assert.ok(receivedSignal instanceof AbortSignal);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = oldFrom;
  }
});
