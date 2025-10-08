import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();

router.post("/update_password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
    }

    const normalized = email.trim().toLowerCase();

    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user)
      return res.status(404).json({ error: "No user found with this email" });

    const password_hash = await bcrypt.hash(newPassword, 10);

    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ password_hash })
      .eq("user_id", user.user_id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
