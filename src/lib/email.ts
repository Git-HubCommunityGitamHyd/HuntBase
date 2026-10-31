export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set");
    }
    // Development only: no email is sent, so show the code in the server terminal.
    console.log(`[DEV ONLY] Verification code for ${to}: ${otp}`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Your HuntBase verification code",
      text: `Your HuntBase verification code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error(`Email provider returned ${res.status}`);
}