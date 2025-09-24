import { Router } from "express";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();

router.post("/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body as {
      email?: string;
      code?: string | number;
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    const codeStr = String(code ?? "").trim();
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ error: "Code must be 6 digits" });
    }

    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, verification_token, email_verified")
      .eq("email", email)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified)
      return res.status(200).json({ ok: true, alreadyVerified: true });
    if (user.verification_token == null)
      return res.status(400).json({ error: "No verification code on file" });

    if (Number(codeStr) !== Number(user.verification_token)) {
      return res.status(401).json({ error: "Invalid code" });
    }

    const { data: updated, error: updErr } = await supabaseClient
      .from("users")
      .update({ email_verified: true, verification_token: null })
      .eq("user_id", user.user_id)
      .select("user_id, email, email_verified")
      .single();

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.status(200).json({ ok: true, user: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
