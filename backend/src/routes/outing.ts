import { Router } from "express";
import { supabase as db } from "../lib/supabase";
import { publicUrlFromPath } from "../utils/storage";

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
async function getOuting(id: number) {
  const { data, error } = await db
    .from("outings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function isAdminOrCreator(outingId: number, userId: string) {
  // creator?
  const outing = await getOuting(outingId);
  if (outing && outing.creator_id === userId) return true;

  // admin member?
  const { data, error } = await db
    .from("outing_members")
    .select("role")
    .eq("outing_id", outingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return !!data && data.role === "admin";
}

// helper to get user_id from email (like profile routes)
async function getUserIdFromEmail(email: string): Promise<string | null> {
  if (!email) return null;
  
  const { data: user, error } = await db
    .from("users")
    .select("user_id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
    
  if (error || !user) return null;
  return user.user_id;
}

// GET /api/outings  -> list my outings
// GET /api/outings  -> list outings I own OR I’m a member of
router.get("/outings", async (req, res) => {
  try {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const userId = await getUserIdFromEmail(email);
    if (!userId) return res.status(401).json({ error: "User not found" });

    // 1) Outings I created
    const ownQ = db
      .from("outings")
      .select("*")
      .eq("creator_id", userId);

    // 2) Outings where I’m a member (join via outing_members)
    //    Supabase: select from outing_members and pull the joined outing
    const memberQ = db
      .from("outing_members")
      .select("outing:outings(*)")
      .eq("user_id", userId);

    const [{ data: own, error: ownErr }, { data: mem, error: memErr }] =
      await Promise.all([ownQ, memberQ]);

    if (ownErr) return res.status(500).json({ error: ownErr.message });
    if (memErr) return res.status(500).json({ error: memErr.message });

    const memberOutings =
      (mem || [])
        .map((r: any) => r.outing)
        .filter(Boolean);

    // merge + dedupe by id
    const seen = new Set<number>();
    const all = ([] as any[])
      .concat(own || [], memberOutings)
      .filter((o) => (o && !seen.has(o.id) && seen.add(o.id)));

    // sort same as before
    all.sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));

    res.json({ outings: all });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// POST /api/outings  -> create
router.post("/outings", async (req, res) => {
  try {
    console.log("=== POST /api/outings START ===");
    console.log("Request body:", req.body);
    
    const { email, title, location, start_date, end_date } = req.body || {};
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log("❌ Invalid email format");
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!title || !location || !start_date || !end_date) {
      console.log("❌ Missing required fields");
      return res.status(400).json({ error: "Missing fields" });
    }

    console.log("✅ Validation passed, looking up user...");
    const userId = await getUserIdFromEmail(email);
    console.log("User ID found:", userId);
    
    if (!userId) {
      console.log("❌ User not found in database");
      return res.status(401).json({ error: "User not found" });
    }

    console.log("✅ User found, inserting outing...");
    const { data, error } = await db
      .from("outings")
      .insert({ title, location, start_date, end_date, creator_id: userId })
      .select()
      .single();

    if (error) {
      console.error("❌ Database insert error:", error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log("✅ Outing created successfully:", data);
    console.log("=== POST /api/outings END ===");
    res.status(201).json({ outing: data });
  } catch (e: any) {
    console.error("❌ POST /api/outings exception:", e);
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// GET /api/outings/invites?email=me@example.com&status=pending
router.get("/outings/invites", async (req, res) => {
  try {
    const email = String(req.query?.email || "");
    const status = String(req.query?.status || "pending").toLowerCase(); // optional: pending|accepted|declined
    const me = await getUserByEmail(email);

    // grab my invites (as invitee)
    const { data: invs, error } = await db
      .from("outing_invites")
      .select("id, outing_id, inviter_id, invitee_id, status, created_at, responded_at")
      .eq("invitee_id", me.user_id)
      .eq("status", status);
    if (error) return res.status(500).json({ error: error.message });

    if (!invs?.length) return res.json({ invites: [] });

    // fetch outing + inviter info
    const outingIds = [...new Set(invs.map(i => i.outing_id))];
    const inviterIds = [...new Set(invs.map(i => i.inviter_id))];

    const [{ data: outings, error: oErr }, { data: users, error: uErr }] = await Promise.all([
      db.from("outings").select("id, title, location, start_date, end_date").in("id", outingIds),
      db.from("users").select("user_id, email, first_name, last_name, profiles(display_name, avatar_path)").in("user_id", inviterIds),
    ]);
    if (oErr) return res.status(500).json({ error: oErr.message });
    if (uErr) return res.status(500).json({ error: uErr.message });

    const outingById = new Map((outings || []).map(o => [o.id, o]));
    const userById = new Map((users || []).map((u: any) => [u.user_id, u]));

    const invites = invs.map(i => {
      const inv = userById.get(i.inviter_id) || {};
      const name = [inv.first_name, inv.last_name].filter(Boolean).join(" ");
      return {
        id: i.id,
        status: i.status,
        created_at: i.created_at,
        responded_at: i.responded_at,
        outing: outingById.get(i.outing_id) || null,
        inviter: {
          user_id: inv.user_id,
          email: inv.email,
          name,
          display_name: inv.profiles?.display_name ?? null,
          avatar_path: publicUrlFromPath(inv.profiles?.avatar_path),  // ✅ make it a public URL
        },
      };
    });

    res.json({ invites });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});


// =============================================================
// NEW: Respond to an invite (accept/decline)
// POST /api/outings/invites/:inviteId/respond  { email, action: 'accept'|'decline' }
// =============================================================
router.post("/outings/invites/:inviteId/respond", async (req, res) => {
  try {
    const inviteId = Number(req.params.inviteId);
    const me = await getUserByEmail(req.body?.email);
    const action = String(req.body?.action || "").toLowerCase();

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({ error: "action must be 'accept' or 'decline'" });
    }

    // Only the invitee can respond
    const { data: invite, error: iErr } = await db
      .from("outing_invites")
      .select("id, outing_id, invitee_id, status")
      .eq("id", inviteId)
      .maybeSingle();
    if (iErr) return res.status(500).json({ error: iErr.message });
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.invitee_id !== me.user_id) return res.status(403).json({ error: "Not your invite" });
    if (invite.status !== "pending") return res.status(409).json({ error: "Invite already handled" });

    const newStatus = action === "accept" ? "accepted" : "declined";

    const { data, error } = await db
      .from("outing_invites")
      .update({ status: newStatus, responded_at: new Date().toISOString() })
      .eq("id", inviteId)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // Trigger will auto-insert into outing_members if 'accepted'
    res.json({ invite: data });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});



// DELETE /api/outings/:id  -> delete
router.delete("/outings/:id", async (req, res) => {
  try {
    const email = String(req.query.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const userId = await getUserIdFromEmail(email);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const { error } = await db
      .from("outings")
      .delete()
      .eq("id", req.params.id)
      .eq("creator_id", userId);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});


// GET /api/outings/:id  -> fetch a single outing (scoped to the caller's email)
router.get("/outings/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const email = String(req.query.email ?? "").trim().toLowerCase();

    if (!id) return res.status(400).json({ error: "Invalid id" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const userId = await getUserIdFromEmail(email);
    if (!userId) return res.status(401).json({ error: "User not found" });

    // 1) fetch the outing by id (no creator filter)
    const { data: outing, error: oErr } = await db
      .from("outings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (oErr) return res.status(500).json({ error: oErr.message });
    if (!outing) return res.status(404).json({ error: "Not found" });

    // 2) authorize: creator OR member
    if (outing.creator_id !== userId) {
      const { data: mem, error: mErr } = await db
        .from("outing_members")
        .select("user_id")
        .eq("outing_id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (mErr) return res.status(500).json({ error: mErr.message });
      if (!mem) return res.status(403).json({ error: "Not allowed" });
    }

    return res.json({ outing });
  } catch (e: any) {
    console.error("GET /outings/:id error", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});


// NEW: List members (with avatar/display name) for an outing
// GET /api/outings/:id/members
// =============================================================
router.get("/outings/:id/members", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const { data: rows, error: mErr } = await db
      .from("outing_members")
      .select("user_id, role, joined_at")
      .eq("outing_id", id);
    if (mErr) return res.status(500).json({ error: mErr.message });

    if (!rows?.length) return res.json({ members: [] });

    const ids = rows.map(r => r.user_id);
    const { data: users, error: uErr } = await db
      .from("users")
      .select("user_id, email, first_name, last_name, profiles(display_name, avatar_path)")
      .in("user_id", ids);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const byId = new Map(users?.map((u: any) => [u.user_id, u]) || []);
    const members = rows.map(r => {
      const u: any = byId.get(r.user_id) || {};
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      return {
        user_id: r.user_id,
        email: u.email || null,
        name,
        display_name: u.profiles?.display_name ?? null,
        avatar_url: publicUrlFromPath(u.profiles?.avatar_path),
        role: r.role,
        joined_at: r.joined_at,
      };
    });

    res.json({ members });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Server error" });
  }
});

// =============================================================
// NEW: Send an invite to a friend
// POST /api/outings/:id/invite { inviterEmail, inviteeEmail }
// =============================================================
router.post("/outings/:id/invite", async (req, res) => {
  try {
    const outingId = Number(req.params.id);
    const inviter = await getUserByEmail(req.body?.inviterEmail);
    const invitee = await getUserByEmail(req.body?.inviteeEmail);

    if (!(await isAdminOrCreator(outingId, inviter.user_id))) {
      return res.status(403).json({ error: "Not allowed to invite for this outing" });
    }

    // Already a member?
    const { data: existsMember } = await db
      .from("outing_members")
      .select("user_id")
      .eq("outing_id", outingId)
      .eq("user_id", invitee.user_id)
      .maybeSingle();
    if (existsMember) return res.status(409).json({ error: "User is already a member" });

    // Insert invite (unique on (outing_id, invitee_id))
    const { data, error } = await db
      .from("outing_invites")
      .insert([{ outing_id: outingId, inviter_id: inviter.user_id, invitee_id: invitee.user_id }])
      .select()
      .single();

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return res.status(409).json({ error: "Invite already exists" });
      }
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ invite: data });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

// =============================================================
// NEW: List invites for me (incoming + outgoing) for one outing
// GET /api/outings/:id/invites?email=me@example.com
// =============================================================
router.get("/outings/:id/invites", async (req, res) => {
  try {
    const outingId = Number(req.params.id);
    const me = await getUserByEmail(String(req.query?.email));

    const { data: invs, error } = await db
      .from("outing_invites")
      .select("id, inviter_id, invitee_id, status, created_at, responded_at")
      .eq("outing_id", outingId);
    if (error) return res.status(500).json({ error: error.message });

    const ids = [...new Set(invs.flatMap(i => [i.inviter_id, i.invitee_id]))];
    if (!ids.length) return res.json({ invites: [] });

    const { data: users, error: uErr } = await db
      .from("users")
      .select("user_id, email, first_name, last_name, profiles(display_name, avatar_path)")
      .in("user_id", ids);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const byId = new Map(users?.map((u: any) => [u.user_id, u]) || []);
    const invites = invs.map(i => {
      const inv = byId.get(i.inviter_id) || {};
      const iee = byId.get(i.invitee_id) || {};
      const fmt = (u: any) => ({
        user_id: u.user_id,
        email: u.email,
        name: [u.first_name, u.last_name].filter(Boolean).join(" "),
        display_name: u.profiles?.display_name ?? null,
        avatar_url: publicUrlFromPath(u.profiles?.avatar_path),
      });
      return {
        id: i.id,
        outing_id: outingId,
        inviter: fmt(inv),
        invitee: fmt(iee),
        status: i.status,
        created_at: i.created_at,
        responded_at: i.responded_at,
        isMine: i.invitee_id === me.user_id || i.inviter_id === me.user_id,
      };
    });

    res.json({ invites });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});


export default router;
