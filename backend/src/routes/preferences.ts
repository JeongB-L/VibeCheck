import { Router } from 'express';
import { supabase as db } from '../lib/supabase';

const router = Router();

/**
 * POST /api/outings/:outingId/preferences/batch
 * Body: { emails: string[] }
 * Returns: { list: Array<{ email: string, user_id: string|null, prefs: { activities: string[], food: string[], budget: string[] } | null }> }
 *
 * - For each email, we look up users.user_id and then read from public.outing_preferences.
 * - If no row in outing_preferences, prefs = null (so UI can show "No preferences set yet.").
 */
router.post('/outings/:outingId/preferences/batch', async (req, res) => {
  try {
    const outingId = Number(req.params.outingId);
    if (!outingId || Number.isNaN(outingId)) {
      return res.status(400).json({ error: 'Invalid outingId' });
    }

    const emailsInput = Array.isArray(req.body?.emails) ? req.body.emails : [];
    const emails = emailsInput
      .map((e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
      .filter(Boolean);

    if (!emails.length) {
      return res.status(400).json({ error: 'emails[] is required' });
    }

    // 1) Map emails -> users.user_id
    const { data: users, error: usersErr } = await db
      .from('users')
      .select('user_id, email')
      .in('email', emails);

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
        .from('outing_preferences')
        .select('user_id, activities, food, budget')
        .eq('outing_id', outingId)
        .in('user_id', userIds);

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
    return res.status(500).json({ error: e?.message || 'Server error' });
  }
});

export default router;
