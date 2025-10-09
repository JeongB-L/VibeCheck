import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../lib/supabase";

const router = Router();

/**
 * POST /api/account/deactivate
 * Auth: dev header "x-user-id" (or middleware sets req.userId)
 * - Sets users.status = 'DEACTIVATED'
 * - (Optional) invalidate refresh tokens if you also use Supabase Auth sessions
 */
router.post("/deactivate", async (req, res) => {
  const userId = (req as any).userId || (req.header("x-user-id") as string | undefined);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Flip status on USERS (not profiles)
  const { error: upErr } = await supabase
    .from("users")
    .update({ status: "DEACTIVATED" })
    .eq("user_id", userId);

  if (upErr) return res.status(500).json({ error: "Failed to deactivate" });

  return res.json({ ok: true });
});

/**
 * POST /api/account/reactivate
 * Body: { email, password }
 * - Verifies credentials against your users table (bcrypt)
 * - If users.status === 'DEACTIVATED', flips to 'ACTIVE'
 * - Does NOT return a session; client will retry normal login
 */
router.post("/reactivate", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

  const normalized = String(email).trim().toLowerCase();

  // Look up user in your USERS table
  const { data: user, error } = await supabase
    .from("users")
    .select("user_id, email, password_hash, status")
    .eq("email", normalized)
    .single();

  if (error || !user?.password_hash) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  if (user.status !== "DEACTIVATED") {
    return res.status(400).json({ error: "Account is not deactivated" });
  }

  const { error: upErr } = await supabase
    .from("users")
    .update({ status: "ACTIVE" })
    .eq("user_id", user.user_id);

  if (upErr) return res.status(500).json({ error: "Could not reactivate" });

  return res.json({ ok: true });
});

export default router;
