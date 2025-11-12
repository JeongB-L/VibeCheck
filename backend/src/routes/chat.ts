// backend/src/routes/chat.ts
import { Router } from "express";
import { supabase as db } from "../lib/supabase";

const router = Router();

function normEmail(e?: string) {
  const v = (e || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error("Valid email is required");
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
  if (a === b) throw new Error("Cannot chat with yourself");
  return a < b ? [a, b] : [b, a];
}

/** ensure a direct thread exists for two users and return it */
async function ensureThreadForPair(userIdA: string, userIdB: string) {
  const [ua, ub] = orderPair(userIdA, userIdB);

  // try to find
  {
    const { data, error } = await db
      .from("direct_threads")
      .select("id, user_a, user_b, last_message_at, created_at")
      .eq("user_a", ua)
      .eq("user_b", ub)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  // create
  const { data, error } = await db
    .from("direct_threads")
    .insert([{ user_a: ua, user_b: ub }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

/* POST /api/chat/thread { meEmail, friendEmail } */
router.post("/chat/thread", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const friend = await getUserByEmail(req.body?.friendEmail);
    const thread = await ensureThreadForPair(me.user_id, friend.user_id);
    res.status(201).json({ thread });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Cannot chat/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/* GET /api/chat/threads?email=me@example.com
   Returns the user's DM threads with:
   - other user basic info (via users + profiles)
   - last message preview
   - unread count (messages not sent by me with read_at is null)
*/
router.get("/chat/threads", async (req, res) => {
  try {
    const me = await getUserByEmail(String(req.query?.email));

    // fetch threads where user is a or b
    const { data: threads, error: tErr } = await db
      .from("direct_threads")
      .select("id, user_a, user_b, last_message_at, created_at")
      .or(`user_a.eq.${me.user_id},user_b.eq.${me.user_id}`)
      .order("last_message_at", { ascending: false });
    if (tErr) return res.status(500).json({ error: tErr.message });

    if (!threads?.length) return res.json({ threads: [] });

    const otherIds = threads.map((t) => (t.user_a === me.user_id ? t.user_b : t.user_a));

    // other user info
    const { data: users, error: uErr } = await db
      .from("users")
      .select("user_id, email, first_name, last_name, profiles(display_name, avatar_path)")
      .in("user_id", otherIds);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const userMap = new Map(
      (users || []).map((u: any) => [
        u.user_id,
        {
          user_id: u.user_id,
          email: u.email,
          name: [u.first_name, u.last_name].filter(Boolean).join(" "),
          display_name: u.profiles?.display_name ?? null,
          avatar_path: u.profiles?.avatar_path ?? null,
        },
      ])
    );

    // last message + unread count per thread
    const threadIds = threads.map((t) => t.id);

    const { data: lastMsgs, error: lmErr } = await db
      .from("direct_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    if (lmErr) return res.status(500).json({ error: lmErr.message });

    const lastByThread = new Map<number, any>();
    for (const m of lastMsgs || []) {
      if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m);
    }

    // unread counts
    const { data: unreadRows, error: urErr } = await db
      .from("direct_messages")
      .select("thread_id, id")
      .in("thread_id", threadIds)
      .is("read_at", null)
      .neq("sender_id", me.user_id);
    if (urErr) return res.status(500).json({ error: urErr.message });

    const unreadByThread = new Map<number, number>();
    for (const r of unreadRows || []) {
      unreadByThread.set(r.thread_id, (unreadByThread.get(r.thread_id) || 0) + 1);
    }

    const payload = threads.map((t) => {
      const otherId = t.user_a === me.user_id ? t.user_b : t.user_a;
      return {
        thread_id: t.id,
        other_user: userMap.get(otherId) || { user_id: otherId },
        last_message: lastByThread.get(t.id) || null,
        unread_count: unreadByThread.get(t.id) || 0,
        last_message_at: t.last_message_at,
      };
    });

    res.json({ threads: payload });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/* GET /api/chat/messages?threadId=123&limit=50&beforeId=999
   Returns messages ascending by time (oldest -> newest) for easy rendering.
*/
router.get("/chat/messages", async (req, res) => {
  try {
    const threadId = Number(req.query?.threadId);
    if (!threadId) return res.status(400).json({ error: "threadId is required" });

    const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
    const beforeId = req.query?.beforeId ? Number(req.query.beforeId) : null;

    let q = db
      .from("direct_messages")
      .select("id, thread_id, sender_id, body, created_at, read_at")
      .eq("thread_id", threadId)
      .order("id", { ascending: false })
      .limit(limit);

    if (beforeId) q = q.lt("id", beforeId);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // send oldest->newest
    res.json({ messages: (data || []).reverse() });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Server error" });
  }
});

/* POST /api/chat/message
   { meEmail, friendEmail?, threadId?, body }
   - If friendEmail is provided, we ensure/create the thread.
*/
router.post("/chat/message", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const body = String(req.body?.body || "").trim();
    if (!body) return res.status(400).json({ error: "Message body is required" });

    let threadId = Number(req.body?.threadId) || 0;

    if (!threadId) {
      const friend = await getUserByEmail(req.body?.friendEmail);
      const thread = await ensureThreadForPair(me.user_id, friend.user_id);
      threadId = thread.id;
    }

    const { data: inserted, error } = await db
      .from("direct_messages")
      .insert([{ thread_id: threadId, sender_id: me.user_id, body }])
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // bump thread timestamp
    await db
      .from("direct_threads")
      .update({ last_message_at: inserted.created_at })
      .eq("id", threadId);

    res.status(201).json({ message: inserted });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found|Message body/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

/* POST /api/chat/read
   { meEmail, threadId, upToMessageId }
   Marks as read all messages in thread not sent by me with id <= upToMessageId
*/
router.post("/chat/read", async (req, res) => {
  try {
    const me = await getUserByEmail(req.body?.meEmail);
    const threadId = Number(req.body?.threadId);
    const upToId = Number(req.body?.upToMessageId);
    if (!threadId || !upToId) {
      return res.status(400).json({ error: "threadId and upToMessageId are required" });
    }

    const now = new Date().toISOString();
    const { error } = await db
      .from("direct_messages")
      .update({ read_at: now })
      .eq("thread_id", threadId)
      .lte("id", upToId)
      .neq("sender_id", me.user_id)
      .is("read_at", null);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, read_at: now });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

export default router;
