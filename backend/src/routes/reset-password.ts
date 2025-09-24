import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseClient } from "../lib/supabase";
import { sendVerificationEmail } from "../utils/emails";
import { generate_random_password } from "../utils/random_password_generator";

const router = Router();

router.post("/reset_password", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const normalized = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user)
      return res.status(404).json({ error: "No user found with this email" });

    const newPassword = generate_random_password(12);
    const password_hash = await bcrypt.hash(newPassword, 10);

    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ password_hash })
      .eq("user_id", user.user_id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    await sendVerificationEmail({
      to: normalized,
      subject: "Your Password Has Been Reset",
      name: normalized.split("@")[0] ?? "there",
      verificationUrl: `http://localhost:4200/login`,
      token: newPassword,
      template_choice: "reset_password",
    });

    return res.status(200).json({
      message:
        "Password reset successfully. Check your email for the new password.",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
