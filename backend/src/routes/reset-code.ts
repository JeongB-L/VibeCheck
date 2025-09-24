import { Router } from "express";
import { randomInt } from "crypto";
import { supabase as supabaseClient } from "../lib/supabase";
import { sendVerificationEmail } from "../utils/emails";

const router = Router();

router.post("/resend-code", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const normalized = (email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, email_verified")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user)
      return res
        .status(404)
        .json({ error: "No account found for this email." });
    if (user.email_verified) {
      return res
        .status(409)
        .json({ error: "Email already verified. Please log in." });
    }

    const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenNum = Number(tokenStr);

    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ verification_token: tokenNum })
      .eq("user_id", user.user_id);
    if (updErr) return res.status(500).json({ error: updErr.message });

    try {
      await sendVerificationEmail({
        to: normalized,
        subject: "Your new verification code",
        name: normalized.split("@")[0] ?? "there",
        verificationUrl: `http://localhost:4200/verify?email=${encodeURIComponent(
          normalized
        )}`,
        token: tokenStr,
      });
    } catch (mailErr: any) {
      console.error("Email send failed:", mailErr?.message || mailErr);
      return res.status(200).json({ ok: true, emailSent: false });
    }

    return res.status(200).json({ ok: true, emailSent: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
