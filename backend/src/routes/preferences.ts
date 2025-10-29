import { Router } from "express";
import { supabase as db } from "../lib/supabase";

// --- add below your imports ---
function norm(s: unknown) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

// de-dupe case-insensitively, preserve first casing & trim
function uniqCasePreserve(arr: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(arr) ? arr : []) {
    const t = String(v).trim();
    if (!t) continue;
    const k = norm(t);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

const router = Router();

/** GET /api/outings/:outingId/preferences?email=... */
router.get("/outings/:outingId/preferences", async (req, res) => {
  try {
    const outingId = Number(req.params.outingId);
    const email = String(req.query.email ?? "")
      .trim()
      .toLowerCase();

    if (!outingId || Number.isNaN(outingId)) {
      return res.status(400).json({ error: "Invalid outingId" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // user_id by email
    const { data: user, error: uErr } = await db
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // load prefs
    const { data: pref, error: pErr } = await db
      .from("outing_preferences")
      .select("activities, food, budget")
      .eq("outing_id", outingId)
      .eq("user_id", user.user_id)
      .maybeSingle();
    if (pErr) return res.status(500).json({ error: pErr.message });

    return res.json({
      activities: Array.isArray(pref?.activities) ? pref!.activities : [],
      food: Array.isArray(pref?.food) ? pref!.food : [],
      budget: Array.isArray(pref?.budget) ? pref!.budget : [],
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/** PUT /api/outings/:outingId/preferences  { email, activities?, food?, budget? } */
// Treats PUT as partial update: only updates keys present in the body.
router.put("/outings/:outingId/preferences", async (req, res) => {
  try {
    const outingId = Number(req.params.outingId);
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();

    if (!outingId || Number.isNaN(outingId)) {
      return res.status(400).json({ error: "Invalid outingId" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Find user
    const { data: user, error: uErr } = await db
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Load existing (so missing keys are preserved)
    const { data: existing, error: gErr } = await db
      .from("outing_preferences")
      .select("activities, food, budget")
      .eq("outing_id", outingId)
      .eq("user_id", user.user_id)
      .maybeSingle();
    if (gErr) return res.status(500).json({ error: gErr.message });

    // Build payload: only overwrite keys that appear in req.body
    const payload: any = {
      user_id: user.user_id,
      outing_id: outingId,
      activities: Array.isArray(existing?.activities)
        ? existing!.activities
        : [],
      food: Array.isArray(existing?.food) ? existing!.food : [],
      budget: Array.isArray(existing?.budget) ? existing!.budget : [],
    };

    if ("activities" in req.body)
      payload.activities = uniqCasePreserve(req.body.activities);
    if ("food" in req.body) payload.food = uniqCasePreserve(req.body.food);
    if ("budget" in req.body)
      payload.budget = uniqCasePreserve(req.body.budget);

    // Upsert merged record
    const { error: upErr } = await db
      .from("outing_preferences")
      .upsert([payload], { onConflict: "user_id,outing_id" });
    if (upErr) return res.status(500).json({ error: upErr.message });

    return res.json({
      ok: true,
      activities: payload.activities,
      food: payload.food,
      budget: payload.budget,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * POST /api/outings/:outingId/preferences/batch
 * Body: { emails: string[] }
 * Returns: { list: Array<{ email: string, user_id: string|null, prefs: { activities: string[], food: string[], budget: string[] } | null }> }
 *
 * - For each email, we look up users.user_id and then read from public.outing_preferences.
 * - If no row in outing_preferences, prefs = null (so UI can show "No preferences set yet.").
 */
router.post("/outings/:outingId/preferences/batch", async (req, res) => {
  try {
    const outingId = Number(req.params.outingId);
    if (!outingId || Number.isNaN(outingId)) {
      return res.status(400).json({ error: "Invalid outingId" });
    }

    const emailsInput = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = emailsInput
      .map((e: unknown) =>
        typeof e === "string" ? e.trim().toLowerCase() : ""
      )
      .filter(Boolean);

    if (!emails.length) {
      return res.status(400).json({ error: "emails[] is required" });
    }

    // 1) Map emails -> users.user_id
    const { data: users, error: usersErr } = await db
      .from("users")
      .select("user_id, email")
      .in("email", emails);

    if (usersErr) {
      return res.status(500).json({ error: usersErr.message });
    }

    // Build quick lookups
    const emailToUser = new Map<string, string>();
    for (const u of users || []) {
      if (u?.email && u?.user_id) {
        emailToUser.set(String(u.email).toLowerCase(), String(u.user_id));
      }
    }

    const userIds = [...emailToUser.values()];
    let prefsByUser = new Map<string, any>();

    if (userIds.length) {
      // 2) Fetch all preferences for those user_ids for this outing
      const { data: prefs, error: prefsErr } = await db
        .from("outing_preferences")
        .select("user_id, activities, food, budget")
        .eq("outing_id", outingId)
        .in("user_id", userIds);

      if (prefsErr) {
        return res.status(500).json({ error: prefsErr.message });
      }

      prefsByUser = new Map(
        (prefs || []).map((p) => [
          String(p.user_id),
          {
            activities: Array.isArray(p.activities) ? p.activities : [],
            food: Array.isArray(p.food) ? p.food : [],
            budget: Array.isArray(p.budget) ? p.budget : [],
          },
        ])
      );
    }

    // 3) Return in the same order as input emails
    const list = emails.map((e: string) => {
      const uid = emailToUser.get(e) || null;
      const prefs = uid ? prefsByUser.get(uid) || null : null;
      return { email: e, user_id: uid, prefs };
    });

    return res.json({ list });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

export default router;
