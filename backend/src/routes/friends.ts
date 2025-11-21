import { Router } from "express";
import { supabase as db } from "../lib/supabase";
import { publicUrlFromPath } from "../utils/storage";

const router = Router();

function normEmail(e?: string) {
  const v = (e || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
    throw new Error("Valid email is required");
  return v;
}
async function getUserByEmail(email: string) {
  const e = normEmail(email);
  const { data, error } = await db
    .from("users")
    .select("user_id, email, first_name, last_name")
    .eq("email", e)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("User not found");
  return data;
}
function orderPair(a: string, b: string): [string, string] {
  if (a === b) throw new Error("Cannot friend yourself");
  return a < b ? [a, b] : [b, a];
}

/*  FRIEND LIST (accepted)  */
router.get("/friends", async (req, res) => {
  try {
    const me = await getUserByEmail(String(req.query?.email));

    const { data: pairs, error: fErr } = await db
      .from("friendships")
      .select("user_a, user_b")
      .or(`user_a.eq.${me.user_id},user_b.eq.${me.user_id}`)
      .eq("status", "accepted");
    if (fErr) return res.status(500).json({ error: fErr.message });

    const friendIds = (pairs || []).map((p) =>
      p.user_a === me.user_id ? p.user_b : p.user_a
    );
    if (!friendIds.length) return res.json({ friends: [] });

    const { data: friendUsers, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", friendIds);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const friends = (friendUsers || []).map((u: any) => ({
      user_id: u.user_id,
      email: u.email,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      display_name: u.profiles?.display_name ?? null,
      avatar_path: publicUrlFromPath(u.profiles?.avatar_path),
    }));

    res.json({ friends });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/*  SEND FRIEND REQUEST (PENDING)
 * POST /api/friends  { meEmail, friendEmail }
 * Creates 'pending' if none exists
 * If reverse pending exists, auto-accepts
 */
router.post("/friends", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const [a, b] = orderPair(me.user_id, friend.user_id);

    // Check if a row already exists for the pair
    const { data: existing, error: exErr } = await db
      .from("friendships")
      .select("status, requested_by")
      .eq("user_a", a)
      .eq("user_b", b)
      .maybeSingle();
    if (exErr) return res.status(500).json({ error: exErr.message });

    if (!existing) {
      // Create new pending with me as requester
      const { data, error } = await db
        .from("friendships")
        .insert([
          { user_a: a, user_b: b, status: "pending", requested_by: me.user_id },
        ])
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res
        .status(201)
        .json({ ok: true, friendship: data, state: "pending_outgoing" });
    }

    if (existing.status === "accepted") {
      return res.status(409).json({ error: "Already friends" });
    }

    // If other side already requested → auto-accept
    if (
      existing.status === "pending" &&
      existing.requested_by &&
      existing.requested_by !== me.user_id
    ) {
      const { data, error } = await db
        .from("friendships")
        .update({
          status: "accepted",
          requested_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_a", a)
        .eq("user_b", b)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({
        ok: true,
        friendship: data,
        state: "accepted",
        autoAccepted: true,
      });
    }

    // I already requested
    return res.json({ ok: true, state: "pending_outgoing" });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot friend yourself/.test(msg)
      ? 400
      : 500;
    res.status(code).json({ error: msg });
  }
});

/*  CANCEL OUTGOING REQUEST
 * DELETE /api/friends/request  { meEmail, friendEmail }
 */
router.delete("/friends/request", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const [a, b] = orderPair(me.user_id, friend.user_id);

    const { error } = await db
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b)
      .eq("status", "pending")
      .eq("requested_by", me.user_id); // only the requester can cancel
    if (error) return res.status(500).json({ error: error.message });

    res.status(204).send();
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot friend yourself/.test(msg)
      ? 400
      : 500;
    res.status(code).json({ error: msg });
  }
});

/*  INCOMING PENDING REQUESTS
 * GET /api/friends/pending?email=me@example.com
 */
router.get("/friends/pending", async (req, res) => {
  try {
    const me = await getUserByEmail(String(req.query?.email));

    const { data: rows, error } = await db
      .from("friendships")
      .select("user_a, user_b, requested_by, created_at")
      .or(`user_a.eq.${me.user_id},user_b.eq.${me.user_id}`)
      .eq("status", "pending");
    if (error) return res.status(500).json({ error: error.message });

    // Incoming = requests where requested_by != me
    const incomingPairs = (rows || []).filter(
      (r) => r.requested_by && r.requested_by !== me.user_id
    );
    const senderIds = incomingPairs.map((r) => r.requested_by!) as string[];
    if (!senderIds.length) return res.json({ incoming: [] });

    const { data: senders, error: sErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", senderIds);
    if (sErr) return res.status(500).json({ error: sErr.message });

    const incoming = (senders || []).map((u: any) => ({
      user_id: u.user_id,
      email: u.email,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      display_name: u.profiles?.display_name ?? null,
      avatar_path: publicUrlFromPath(u.profiles?.avatar_path),
    }));
    res.json({ incoming });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/*  OUTGOING PENDING REQUESTS
 * GET /api/friends/outgoing?email=me@example.com
 */
router.get("/friends/outgoing", async (req, res) => {
  try {
    const me = await getUserByEmail(String(req.query?.email));

    const { data: rows, error } = await db
      .from("friendships")
      .select("user_a, user_b, requested_by, created_at")
      .or(`user_a.eq.${me.user_id},user_b.eq.${me.user_id}`)
      .eq("status", "pending")
      .eq("requested_by", me.user_id);
    if (error) return res.status(500).json({ error: error.message });

    // Outgoing = users I requested
    const otherIds = (rows || []).map((r) =>
      r.user_a === me.user_id ? r.user_b : r.user_a
    );
    if (!otherIds.length) return res.json({ outgoing: [] });

    const { data: users, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", otherIds);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const outgoing = (users || []).map((u: any) => ({
      user_id: u.user_id,
      email: u.email,
      name: [u.first_name, u.last_name].filter(Boolean).join(" "),
      display_name: u.profiles?.display_name ?? null,
      avatar_path: publicUrlFromPath(u.profiles?.avatar_path),
    }));
    res.json({ outgoing });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/*  ACCEPT INCOMING
 * POST /api/friends/accept  { meEmail, friendEmail }
 */
router.post("/friends/accept", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const [a, b] = orderPair(me.user_id, friend.user_id);

    const { data, error } = await db
      .from("friendships")
      .update({
        status: "accepted",
        requested_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_a", a)
      .eq("user_b", b)
      .eq("status", "pending")
      .neq("requested_by", me.user_id) // must be incoming
      .select()
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data)
      return res.status(404).json({ error: "Pending request not found" });

    res.json({ ok: true, friendship: data });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot friend yourself/.test(msg)
      ? 400
      : 500;
    res.status(code).json({ error: msg });
  }
});

/*  DECLINE INCOMING
 * POST /api/friends/decline  { meEmail, friendEmail }
 */
router.post("/friends/decline", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const [a, b] = orderPair(me.user_id, friend.user_id);

    const { error } = await db
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b)
      .eq("status", "pending")
      .neq("requested_by", me.user_id); // only decline incoming
    if (error) return res.status(500).json({ error: error.message });

    res.status(204).send();
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot friend yourself/.test(msg)
      ? 400
      : 500;
    res.status(code).json({ error: msg });
  }
});

/*  REMOVE FRIEND (accepted)
 * DELETE /api/friends  { meEmail, friendEmail }
 */
router.delete("/friends", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const [a, b] = orderPair(me.user_id, friend.user_id);

    const { error } = await db
      .from("friendships")
      .delete()
      .eq("user_a", a)
      .eq("user_b", b);
    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot friend yourself/.test(msg)
      ? 400
      : 500;
    res.status(code).json({ error: msg });
  }
});

// suggested friends
// GET /api/friends/suggestions?email=me@example.com&limit=24&offset=0
router.get("/friends/suggestions", async (req, res) => {
  try {
    const me = await getUserByEmail(String(req.query?.email));

    const limit = Math.min(
      parseInt(String(req.query?.limit ?? "24"), 10) || 24,
      60
    );
    const offset = parseInt(String(req.query?.offset ?? "0"), 10) || 0;

    // exclude myself and anyone I already have an accepted friendship with
    const { data: relRows, error: relErr } = await db
      .from("friendships")
      .select("user_a, user_b, status")
      .or(`user_a.eq.${me.user_id},user_b.eq.${me.user_id}`);

    if (relErr) return res.status(500).json({ error: relErr.message });

    const excludeIds = new Set<string>();
    excludeIds.add(me.user_id);

    (relRows || []).forEach((r) => {
      if (r.status === "accepted") {
        excludeIds.add(r.user_a);
        excludeIds.add(r.user_b);
      }
    });

    // users who share an outing with me (mutual outing suggestions – these go on top)
    const { data: myMemberships, error: mErr } = await db
      .from("outing_members")
      .select("outing_id")
      .eq("user_id", me.user_id);

    if (mErr) return res.status(500).json({ error: mErr.message });

    const outingIds = Array.from(
      new Set((myMemberships || []).map((m) => m.outing_id))
    );

    const mutualMap = new Map<string, number>();

    if (outingIds.length) {
      const { data: others, error: oErr } = await db
        .from("outing_members")
        .select("outing_id, user_id")
        .in("outing_id", outingIds)
        .neq("user_id", me.user_id);

      if (oErr) return res.status(500).json({ error: oErr.message });

      (others || []).forEach((r) => {
        if (excludeIds.has(r.user_id)) return;
        mutualMap.set(r.user_id, (mutualMap.get(r.user_id) || 0) + 1);
      });
    }

    // preference based matches using profiles.preferences)
    const { data: myProfile, error: profErr } = await db
      .from("profiles")
      .select("preferences")
      .eq("user_id", me.user_id)
      .maybeSingle();

    if (profErr) return res.status(500).json({ error: profErr.message });

    const myPrefs: string[] = myProfile?.preferences || [];

    let prefIds: string[] = [];
    if (myPrefs.length) {
      // find other users whose preferences overlap with mine
      const { data: prefRows, error: prefErr } = await db
        .from("profiles")
        .select("user_id")
        .overlaps("preferences", myPrefs);

      if (prefErr) return res.status(500).json({ error: prefErr.message });

      prefIds = (prefRows || []).map((r) => r.user_id);
    }

    // combine mutual-outing and preference candidates
    type CandidateMeta = {
      user_id: string;
      hasMutualOuting: boolean;
      matchReason: string;
    };
    const combined = new Map<string, CandidateMeta>();

    // preference-based candidates first
    prefIds.forEach((uid) => {
      if (excludeIds.has(uid)) return;
      const hasMutual = mutualMap.has(uid);
      combined.set(uid, {
        user_id: uid,
        hasMutualOuting: hasMutual,
        matchReason: hasMutual
          ? "mutual_outing+preferences"
          : "preferences_only",
      });
    });

    // mutual-outing candidates (ensure they’re included even if no prefs)
    mutualMap.forEach((_count, uid) => {
      if (excludeIds.has(uid)) return;
      if (combined.has(uid)) {
        const existing = combined.get(uid)!;
        existing.hasMutualOuting = true;
        existing.matchReason = "mutual_outing+preferences";
      } else {
        combined.set(uid, {
          user_id: uid,
          hasMutualOuting: true,
          matchReason: "mutual_outing",
        });
      }
    });

    const allCandidates = Array.from(combined.values());

    // sort so mutual-outing suggestions are on top
    allCandidates.sort((a, b) => {
      if (a.hasMutualOuting && !b.hasMutualOuting) return -1;
      if (!a.hasMutualOuting && b.hasMutualOuting) return 1;
      return 0;
    });

    const total = allCandidates.length;
    const pageSlice = allCandidates.slice(offset, offset + limit);
    const ids = pageSlice.map((c) => c.user_id);

    if (!ids.length) return res.json({ users: [], total });

    // fetch user info + profile for those candidates
    const { data: users, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", ids);

    if (uErr) return res.status(500).json({ error: uErr.message });

    const byId = new Map((users || []).map((u: any) => [u.user_id, u]));

    const payload = pageSlice
      .map((meta) => {
        const u: any = byId.get(meta.user_id);
        if (!u) return null;
        return {
          user_id: u.user_id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(" "),
          display_name: u.profiles?.display_name ?? null,
          avatar_path: publicUrlFromPath(u.profiles?.avatar_path),
          has_mutual_outing: meta.hasMutualOuting,
          match_reason: meta.matchReason,
        };
      })
      .filter(Boolean);

    return res.json({ users: payload, total });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

export default router;
