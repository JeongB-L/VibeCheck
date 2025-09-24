import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalized = email.trim().toLowerCase();
    const { data: user, error } = await supabaseClient
      .from("users")
      .select("user_id, email, password_hash, email_verified")
      .eq("email", normalized)
      .single();

    if (error || !user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.email_verified) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "NOT_VERIFIED",
        user: { email: user.email },
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res
      .status(200)
      .json({ user: { user_id: user.user_id, email: user.email } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
