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

export default router;
