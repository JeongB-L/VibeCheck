// backend/src/routes/notification-settings.ts
import { Router } from "express";
import { supabase as db } from "../lib/supabase";

const router = Router();

// small helper – same email validation pattern you use elsewhere
function normEmail(e?: string) {
  const v = (e || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    throw new Error("Valid email is required");
  }
  return v;
}

async function getUserByEmail(email: string) {
  const e = normEmail(email);
  const { data, error } = await db
    .from("users")
    .select("user_id, email")
    .eq("email", e)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("User not found");
  return data;
}

/**
 * GET /api/notification-settings?email=me@example.com
 * Returns the user's notification preferences.
 * If no row exists yet, returns the default values (true/true/true).
 */
router.get("/notification-settings", async (req, res) => {
  try {
    const email = String(req.query.email || "");
    const user = await getUserByEmail(email);

    const { data, error } = await db
      .from("user_notification_settings")
      .select(
        "email_enabled, outing_reminders_enabled, voting_reminders_enabled"
      )
      .eq("user_id", user.user_id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // defaults if user has never saved settings
    const payload = {
      email_enabled: data?.email_enabled ?? true,
      outing_reminders_enabled: data?.outing_reminders_enabled ?? true,
      voting_reminders_enabled: data?.voting_reminders_enabled ?? true,
    };

    return res.json(payload);
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    return res.status(code).json({ error: msg });
  }
});

/**
 * POST /api/notification-settings
 * Body: { email, emailEnabled, outingRemindersEnabled, votingRemindersEnabled }
 * Upserts the user's preferences.
 */
router.post("/notification-settings", async (req, res) => {
  try {
    const { email, emailEnabled, outingRemindersEnabled, votingRemindersEnabled } =
      req.body || {};

    const user = await getUserByEmail(email);

    const row = {
      user_id: user.user_id,
      email_enabled: Boolean(emailEnabled),
      outing_reminders_enabled: Boolean(outingRemindersEnabled),
      voting_reminders_enabled: Boolean(votingRemindersEnabled),
    };

    const { data, error } = await db
      .from("user_notification_settings")
      .upsert(row, { onConflict: "user_id" })
      .select(
        "email_enabled, outing_reminders_enabled, voting_reminders_enabled"
      )
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    return res.status(code).json({ error: msg });
  }
});

export default router;
