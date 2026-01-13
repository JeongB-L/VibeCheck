import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();

router.post("/update_password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body || {};

    // Basic validation
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ error: "Missing fields" });
    }
    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
    }

    const normalized = String(email).trim().toLowerCase();

    // Fetch the user, including password_hash for comparison
    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, password_hash")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Verify current password (IMPORTANT: await!)
    const ok = await bcrypt.compare(
      String(currentPassword),
      String(user.password_hash || "")
    );
    if (!ok) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    // Hash and update to new password
    const newHash = await bcrypt.hash(String(newPassword), 12);

    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ password_hash: newHash })
      .eq("user_id", user.user_id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.json({ ok: true });
  } catch (e: any) {
    console.error("update_password error:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
