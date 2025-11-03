import { Router } from "express";
import { supabase as db } from "../lib/supabase";
import { publicUrlFromPath } from "../utils/storage";
import openAI, { OpenAI } from "openai";

// --- helpers: robust normalizer for GPT output ---
type PlanStop = {
  time?: string;
  name?: string;
  address?: string;
  categories?: string[];
  matches?: string[];
  priceRange?: string | null;
  description?: string;
  cost_estimate?: string; // may exist in your saved data
  notes?: string;
};

type PlanDay = { date?: string; timeline?: PlanStop[] };
type GeneratedPlan = {
  planId?: string;
  title?: string;
  name?: string; // sometimes the model uses 'name' instead of 'title'
  badge?: string[];
  overview?: string;
  itinerary?: PlanDay[];
  total_budget_estimate?: string;
  fairness_scores?: Record<string, number>;
  avgFairnessIndex?: number | null; // your saved example uses this (0-100)
  summary?: {
    durationHours?: number;
    totalDistanceKm?: number;
    avgFairnessIndex?: number; // 0-1 variant; normalize below
    satisfaction?: Record<string, number>;
  };
  tips?: string;
};

type PlansPayload = { city?: string; plans?: GeneratedPlan[] };

/** Coerce unknown model JSON -> consistent, safe shape for the client */
function normalizePlans(raw: any): PlansPayload {
  const out: PlansPayload = { city: "", plans: [] };
  if (!raw || typeof raw !== "object") return out;

  out.city = typeof raw.city === "string" ? raw.city : "";

  const rawPlans: any[] = Array.isArray(raw.plans) ? raw.plans : [];
  const plans: GeneratedPlan[] = [];

  for (const rp of rawPlans) {
    const plan: GeneratedPlan = {
      planId: typeof rp.planId === "string" ? rp.planId : undefined,
      title: typeof rp.title === "string" ? rp.title : undefined,
      name: typeof rp.name === "string" ? rp.name : undefined,
      badge: Array.isArray(rp.badge) ? rp.badge.filter((x: any) => typeof x === "string") : [],
      overview: typeof rp.overview === "string" ? rp.overview : "",
      total_budget_estimate:
        typeof rp.total_budget_estimate === "string" ? rp.total_budget_estimate : undefined,
      fairness_scores:
        rp.fairness_scores && typeof rp.fairness_scores === "object" ? rp.fairness_scores : {},
      avgFairnessIndex:
        typeof rp.avgFairnessIndex === "number" ? rp.avgFairnessIndex : null,
      tips: typeof rp.tips === "string" ? rp.tips : "",
      itinerary: [],
      summary: undefined,
    };

    // Summary (either shape)
    if (rp.summary && typeof rp.summary === "object") {
      const s = rp.summary;
      plan.summary = {
        durationHours: typeof s.durationHours === "number" ? s.durationHours : undefined,
        totalDistanceKm: typeof s.totalDistanceKm === "number" ? s.totalDistanceKm : undefined,
        avgFairnessIndex:
          typeof s.avgFairnessIndex === "number" ? s.avgFairnessIndex : undefined, // 0..1 version
        satisfaction:
          s.satisfaction && typeof s.satisfaction === "object" ? s.satisfaction : undefined,
      };
    }

    // Itinerary
    const rawDays: any[] = Array.isArray(rp.itinerary) ? rp.itinerary : [];
    for (const d of rawDays) {
      const day: PlanDay = { date: "", timeline: [] };
      day.date = typeof d.date === "string" ? d.date : "";

      const rawStops: any[] = Array.isArray(d.timeline) ? d.timeline : [];
      for (const st of rawStops) {
        const stop: PlanStop = {
          time: typeof st.time === "string" ? st.time : "",
          name: typeof st.name === "string" ? st.name : "",
          address: typeof st.address === "string" ? st.address : "",
          categories: Array.isArray(st.categories)
            ? st.categories.filter((x: any) => typeof x === "string")
            : [],
          matches: Array.isArray(st.matches)
            ? st.matches.filter((x: any) => typeof x === "string")
            : [],
          priceRange:
            typeof st.priceRange === "string" ? st.priceRange :
            typeof st.cost_estimate === "string" && /\$+|free/i.test(st.cost_estimate)
              ? (st.cost_estimate.match(/\$+/)?.[0] ?? "Free")
              : null,
          description: typeof st.description === "string" ? st.description : "",
          cost_estimate: typeof st.cost_estimate === "string" ? st.cost_estimate : undefined,
          notes: typeof st.notes === "string" ? st.notes : undefined,
        };

        // Skip stops with neither name nor address
        if (!stop.name && !stop.address) continue;
        day.timeline!.push(stop);
      }

      // Skip empty days
      if (!day.timeline!.length) continue;
      plan.itinerary!.push(day);
    }

    // Ensure we have a title
    if (!plan.title && plan.name) plan.title = plan.name;
    if (!plan.title) plan.title = plan.planId || "Plan";

    // Keep only usable plans
    if (plan.itinerary && plan.itinerary.length) plans.push(plan);
  }

  out.plans = plans;
  return out;
}



const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const email = String(req.query.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const userId = await getUserIdFromEmail(email);
    if (!userId) return res.status(401).json({ error: "User not found" });

    // 1) Outings I created
    const ownQ = db.from("outings").select("*").eq("creator_id", userId);

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

    const memberOutings = (mem || []).map((r: any) => r.outing).filter(Boolean);

    // merge + dedupe by id
    const seen = new Set<number>();
    const all = ([] as any[])
      .concat(own || [], memberOutings)
      .filter((o) => o && !seen.has(o.id) && seen.add(o.id));

    // sort same as before
    all.sort((a, b) =>
      a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0
    );

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
      .select(
        "id, outing_id, inviter_id, invitee_id, status, created_at, responded_at"
      )
      .eq("invitee_id", me.user_id)
      .eq("status", status);
    if (error) return res.status(500).json({ error: error.message });

    if (!invs?.length) return res.json({ invites: [] });

    // fetch outing + inviter info
    const outingIds = [...new Set(invs.map((i) => i.outing_id))];
    const inviterIds = [...new Set(invs.map((i) => i.inviter_id))];

    const [{ data: outings, error: oErr }, { data: users, error: uErr }] =
      await Promise.all([
        db
          .from("outings")
          .select("id, title, location, start_date, end_date")
          .in("id", outingIds),
        db
          .from("users")
          .select(
            "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
          )
          .in("user_id", inviterIds),
      ]);
    if (oErr) return res.status(500).json({ error: oErr.message });
    if (uErr) return res.status(500).json({ error: uErr.message });

    const outingById = new Map((outings || []).map((o) => [o.id, o]));
    const userById = new Map((users || []).map((u: any) => [u.user_id, u]));

    const invites = invs.map((i) => {
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
          avatar_path: publicUrlFromPath(inv.profiles?.avatar_path), // ✅ make it a public URL
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
      return res
        .status(400)
        .json({ error: "action must be 'accept' or 'decline'" });
    }

    // Only the invitee can respond
    const { data: invite, error: iErr } = await db
      .from("outing_invites")
      .select("id, outing_id, invitee_id, status")
      .eq("id", inviteId)
      .maybeSingle();
    if (iErr) return res.status(500).json({ error: iErr.message });
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.invitee_id !== me.user_id)
      return res.status(403).json({ error: "Not your invite" });
    if (invite.status !== "pending")
      return res.status(409).json({ error: "Invite already handled" });

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
    const email = String(req.query.email ?? "")
      .trim()
      .toLowerCase();
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
    const email = String(req.query.email ?? "")
      .trim()
      .toLowerCase();

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

    // 1️⃣ Get the outing (to identify owner)
    const { data: outing, error: oErr } = await db
      .from("outings")
      .select("creator_id")
      .eq("id", id)
      .maybeSingle();
    if (oErr) return res.status(500).json({ error: oErr.message });
    if (!outing) return res.status(404).json({ error: "Outing not found" });

    // 2️⃣ Get all members
    const { data: rows, error: mErr } = await db
      .from("outing_members")
      .select("user_id, role, joined_at")
      .eq("outing_id", id);
    if (mErr) return res.status(500).json({ error: mErr.message });

    const memberIds = rows.map((r) => r.user_id);
    // Combine members + owner for lookup
    const allIds = Array.from(new Set([...memberIds, outing.creator_id]));

    // 3️⃣ Fetch user data
    const { data: users, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", allIds);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const byId = new Map(users?.map((u: any) => [u.user_id, u]) || []);

    // 4️⃣ Build owner object
    const ownerUser = byId.get(outing.creator_id);
    const owner = ownerUser
      ? {
          user_id: ownerUser.user_id,
          email: ownerUser.email,
          name: [ownerUser.first_name, ownerUser.last_name]
            .filter(Boolean)
            .join(" "),
          display_name: ownerUser.profiles?.display_name ?? null,
          avatar_url: publicUrlFromPath(ownerUser.profiles?.avatar_path),
          role: "owner",
          joined_at: null,
          is_owner: true,
        }
      : null;

    // 5️⃣ Build members excluding owner
    const members = rows
      .filter((r) => r.user_id !== outing.creator_id) // 🚫 exclude owner
      .map((r) => {
        const u: any = byId.get(r.user_id) || {};
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
        return {
          user_id: r.user_id,
          email: u.email || null,
          name,
          display_name: u.profiles?.display_name ?? null,
          avatar_url: publicUrlFromPath(u.profiles?.avatar_path),
          role: r.role ?? "member",
          joined_at: r.joined_at,
          is_owner: false,
        };
      });

    res.json({ owner, members });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Server error" });
  }
});

// =============================================================
// POST /api/outings/:id/invite  { inviterEmail, inviteeEmail }
// - Allows re-invite after decline/accept/remove
// - Idempotent if a PENDING invite already exists
// =============================================================
router.post("/outings/:id/invite", async (req, res) => {
  try {
    const outingId = Number(req.params.id);
    const inviter = await getUserByEmail(req.body?.inviterEmail);
    const invitee = await getUserByEmail(req.body?.inviteeEmail);

    // Must be creator or admin
    if (!(await isAdminOrCreator(outingId, inviter.user_id))) {
      return res
        .status(403)
        .json({ error: "Not allowed to invite for this outing" });
    }

    // Already a member? (don't invite again)
    const { data: existsMember, error: mErr } = await db
      .from("outing_members")
      .select("user_id")
      .eq("outing_id", outingId)
      .eq("user_id", invitee.user_id)
      .maybeSingle();
    if (mErr) return res.status(500).json({ error: mErr.message });
    if (existsMember)
      return res.status(409).json({ error: "User is already a member" });

    // Try to insert a pending invite. Thanks to the PARTIAL unique index,
    // conflict only happens if there's already a PENDING invite.
    const { data, error } = await db
      .from("outing_invites")
      .insert([
        {
          outing_id: outingId,
          inviter_id: inviter.user_id,
          invitee_id: invitee.user_id,
          status: "pending", // <- key
          responded_at: null,
        },
      ])
      .select()
      .single();

    if (!error) {
      return res.status(201).json({ invite: data });
    }

    // If duplicate pending invite, make it idempotent (turn any existing row back to pending)
    // Supabase error codes align with Postgres; duplicate is 23505.
    if (error.code === "23505") {
      const { data: upd, error: updErr } = await db
        .from("outing_invites")
        .update({ status: "pending", responded_at: null })
        .eq("outing_id", outingId)
        .eq("invitee_id", invitee.user_id)
        .select()
        .single();

      if (updErr) return res.status(500).json({ error: updErr.message });
      return res.status(200).json({ invite: upd });
    }

    // Other DB error
    return res.status(500).json({ error: error.message });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    return res.status(code).json({ error: msg });
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

    const ids = [...new Set(invs.flatMap((i) => [i.inviter_id, i.invitee_id]))];
    if (!ids.length) return res.json({ invites: [] });

    const { data: users, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, avatar_path)"
      )
      .in("user_id", ids);
    if (uErr) return res.status(500).json({ error: uErr.message });

    const byId = new Map(users?.map((u: any) => [u.user_id, u]) || []);
    const invites = invs.map((i) => {
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

// =============================================================
// POST /api/outings/:id/removeMember  { requesterEmail, memberEmail }
// Removes from outing_members. Does NOT touch invites.
// =============================================================
router.post("/outings/:id/removeMember", async (req, res) => {
  try {
    const outingId = Number(req.params.id);
    const requester = await getUserByEmail(req.body?.requesterEmail);
    const toRemove = await getUserByEmail(req.body?.memberEmail);

    if (!(await isAdminOrCreator(outingId, requester.user_id))) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // Can't remove the creator
    const outing = await getOuting(outingId);
    if (outing?.creator_id === toRemove.user_id) {
      return res.status(409).json({ error: "Owner cannot be removed" });
    }

    const { error } = await db
      .from("outing_members")
      .delete()
      .eq("outing_id", outingId)
      .eq("user_id", toRemove.user_id);

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ ok: true });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const code = /Valid email|User not found/.test(msg) ? 400 : 500;
    res.status(code).json({ error: msg });
  }
});

router.post("/outings/:id/updateUserOutingPreferences", async (req, res) => {
  try {
    const { id: outingId } = req.params;
    const { userId, activities, food, budget } = req.body;

    // Validate required fields
    if (
      !outingId ||
      !userId ||
      !Array.isArray(activities) ||
      !Array.isArray(food) ||
      !Array.isArray(budget)
    ) {
      return res
        .status(400)
        .json({ error: "Missing or invalid required fields" });
    }

    // Fetch the outing to verify existence
    const outing = await getOuting(Number(outingId));
    if (!outing) {
      return res.status(404).json({ error: "Outing not found" });
    }

    // Upsert into outing_preferences table (updates if exists, inserts if not)
    const { data: updatedPref, error: upsertErr } = await db
      .from("outing_preferences")
      .upsert({
        user_id: userId,
        outing_id: Number(outingId),
        activities,
        food,
        budget,
      })
      .select()
      .single();

    if (upsertErr) throw upsertErr;

    // Return success
    res.json({
      success: true,
      message: "User outing preferences updated successfully",
      outingId: Number(outingId),
    });
  } catch (e: any) {
    console.error("Error updating user outing preferences:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Reuse the same query logic from router.get("/outings/:id/members")
async function getOutingMembers(outingId: number) {
  // 1️⃣ Get outing (to identify owner)
  const { data: outing, error: oErr } = await db
    .from("outings")
    .select("creator_id")
    .eq("id", outingId)
    .maybeSingle();
  if (oErr) throw new Error(oErr.message);
  if (!outing) throw new Error("Outing not found");

  // 2️⃣ Get all members
  const { data: rows, error: mErr } = await db
    .from("outing_members")
    .select("user_id, role, joined_at")
    .eq("outing_id", outingId);
  if (mErr) throw new Error(mErr.message);

  const memberIds = rows.map((r) => r.user_id);
  const allIds = Array.from(new Set([...memberIds, outing.creator_id]));

  // 3️⃣ Fetch user data
  const { data: users, error: uErr } = await db
    .from("users")
    .select("user_id, email, first_name, last_name, profiles(display_name, avatar_path)")
    .in("user_id", allIds);
  if (uErr) throw new Error(uErr.message);

  const byId = new Map(users?.map((u: any) => [u.user_id, u]) || []);

  const ownerUser = byId.get(outing.creator_id);
  const owner = ownerUser
    ? {
        user_id: ownerUser.user_id,
        email: ownerUser.email,
        name: [ownerUser.first_name, ownerUser.last_name].filter(Boolean).join(" "),
        display_name: ownerUser.profiles?.display_name ?? null,
        avatar_url: publicUrlFromPath(ownerUser.profiles?.avatar_path),
        role: "owner",
        joined_at: null,
        is_owner: true,
      }
    : null;

  const members = rows
    .filter((r) => r.user_id !== outing.creator_id)
    .map((r) => {
      const u: any = byId.get(r.user_id) || {};
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ");
      return {
        user_id: r.user_id,
        email: u.email || null,
        name,
        display_name: u.profiles?.display_name ?? null,
        avatar_url: publicUrlFromPath(u.profiles?.avatar_path),
        role: r.role ?? "member",
        joined_at: r.joined_at,
        is_owner: false,
      };
    });

  return { owner, members };
}



router.post("/generate-outing", async (req, res) => {



  console.log("=== POST /api/generate-outing START ===");
  // 1. Get all user preferences from the database based on current outing

  const { outingId } = req.body;
  if (!outingId) {
    return res.status(400).json({ error: "outingId is required" });
  }

  // 2. Get the outing date from the database
  const outing = await getOuting(outingId);
  if (!outing) {
    return res.status(404).json({ error: "Outing not found" });
  }

  const outingTitle = outing.title;
  const outingLocation = outing.location;
  const startDate = new Date(outing.start_date);
  const endDate = new Date(outing.end_date);

  // Validate dates
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return res.status(400).json({ error: "Invalid outing dates" });
  }
  let participantNames: string[] = [];
  // 2.1 Get all user preferences for this outing
  try {
    // 2.1.1 Get all member user_ids for the outing
    console.log(" - Fetching outing members for outingId:", outingId);
    const { owner, members } = await getOutingMembers(outingId);
  participantNames = [owner, ...(members ?? [])]
    .filter(Boolean)
    .map((p: any) =>
      p.display_name || p.name || (p.email ? p.email.split("@")[0] : "Unknown")
    );
    console.log(participantNames) 

    const { data: memberRows, error: mErr } = await db
      .from("outing_members")
      .select("user_id")
      .eq("outing_id", outingId);

    if (mErr) return res.status(500).json({ error: mErr.message });

    // include the creator as participant as well
    const memberIds = (memberRows || []).map((r: any) => r.user_id);
    const userIds = Array.from(new Set([...memberIds, outing.creator_id]));


    // 2.1.2 Fetch preferences for those user_ids for this outing
    if (!userIds.length) {
      req.body.userPreferences = [];
    } else {
      const { data: prefsRows, error: pErr } = await db
        .from("outing_preferences")
        .select("user_id, activities, food, budget")
        .eq("outing_id", outingId)
        .in("user_id", userIds);

      if (pErr) return res.status(500).json({ error: pErr.message });

      // normalize into a map and ensure default shapes for missing prefs
      const prefsMap = new Map(
        (prefsRows || []).map((p: any) => [p.user_id, p])
      );

      const userPreferences = userIds.map((uid) => ({
        user_id: uid,
        preferences: prefsMap.get(uid) || {
          activities: [],
          food: [],
          budget: [],
        },
      }));

      req.body.userPreferences = userPreferences;
    }
  } catch (err: any) {
    console.error("Failed to load outing preferences", err);

    return res
      .status(500)
      .json({ error: err?.message || "Failed to load preferences" });
  }

  // 3. Generate an outing plan based on preferences and date
  // 		a. write a prompt for openAI api
  console.log(" - Generating outing plan via OpenAI for outingId:", outingId);
  let prompt = `You are a helpful travel planner. Generate 3 detailed outing plans for the following group outing, balancing preferences for fairness:
  
  Outing Title: ${outingTitle}
  Location: ${outingLocation}
  Start Date: ${
    startDate.toISOString().split("T")[0]
  } (assume full day unless specified)
  End Date: ${
    endDate.toISOString().split("T")[0]
  } (assume full day unless specified)

  Participants names:
  ${JSON.stringify(participantNames, null, 2)}
  Group Preferences (aggregated from all participants):
  ${JSON.stringify(req.body.userPreferences, null, 2)}
  
  Create 3 alternative day-by-day itineraries that incorporate the group's preferred activities, food options, and budget considerations. For each plan, ensure a timeline-based structure with dated activities and meals. Compute a fairness score for each user (0-100%) based on how much of their individual preferences (activities, food, budget) are reflected in the plan—higher scores mean better balance across the group. Also include total average fairness score (0-100%). Also include badges for itinerary like "Highest Thrill", "Art Forward" that best suit each itinerary. 
  
  Structure the output strictly as JSON with this schema:
  {
  "city": "city name"
	"plans": [
	  {
		"planId": "plan1",
		"name": "art day",
    "badge": ["Moderate Cost", "Art Thrill", ...],
    "overview": "Brief summary of the plan",
		"itinerary": [
		  {
			"date": "YYYY-MM-DD",
			"timeline": [
			  {
				"time": "e.g., 9:00 AM - 12:00 PM",
        "name": "Art Institute of Chicago"
        "address": "111 S Michigan Ave, Chicago, IL 60603"
				"categories": ["Biking", "Outdoor"],
				"description": "Detailed activity",
        "matches": ["username1", "username2"],
				"cost_estimate": "Budget-friendly estimate per person",
			  },
			  {
				"time": "e.g., 12:00 PM - 1:00 PM",
        "name": "MingHin Cuisine (Chinatown)",
				"address": "2168 S Archer Ave, Chicago, IL 60616",
        "categories": ["Dim Sum", "Food"],
				"description": "Food suggestion",
				"matches": ["username3"],
				"cost_estimate": "Per person",
			  }
			]
		  }
		],
		"total_budget_estimate": "Overall group estimate",
    "avgFairnessIndex": 86
		"fairness_scores": {
		  "username1": 85, // Example: percentage (0-100) for each user_id from preferences
		  "username2": 92
		  // ... for all users
		},
		"tips": "Additional suggestions"
	  },
	  {
		"title": "plan2",
		// ... same structure as plan1
	  },
	  {
		"title": "plan3",
		// ... same structure as plan1
	  }
	]
  }
  
	Ensure each plan is fun, feasible for the location and dates,
	varies in focus (e.g., one budget-heavy, one adventure-focused),
	and maximizes overall fairness. Keep it realistic and engaging. Above json format is just an example. The plans should come from the user preferences. Also use the particpant names given above for fairness score and matches`;

  //		b. call openAI api with the prompt
  console.log(" - Sending prompt to OpenAI API");
  try {
    const completion = await openai.chat.completions.create({
      // This takes at least 20 seconds.
      // TODO: maybe add a cancel generating outing.
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert itinerary planner specializing in group outings with fairness optimization.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    const rawResponse = completion.choices[0]?.message?.content;
    if (!rawResponse) {
      throw new Error("No response from OpenAI");
    }
    console.log(" - OpenAI response received");
    //console.log("Raw OpenAI Response:", rawResponse);

    console.log(" - Parsing OpenAI response");
    //    c. parse the response from OpenAI api
    let generatedPlans;
    try {
      generatedPlans = JSON.parse(rawResponse);
    } catch (parseErr) {
      console.error("Failed to parse OpenAI response as JSON:", parseErr);

      // Fallback: Treat as plain text if JSON fails
      generatedPlans = {
        plans: [
          {
            title: "plan1",
            overview: rawResponse,
            itinerary: [],
            total_budget_estimate: "TBD",
            fairness_scores: {},
            tips: "Plan generated; review for details.",
          },
        ],
      };
    }

    // 4. Save all the generated outing plans to db and map it with the current outing
    console.log(" - Saving generated plans to database");
    const { data: savedPlan, error: saveErr } = await db
      .from("outing_plans")
      .upsert(
        {
          outing_id: outingId,
          plans: JSON.stringify(generatedPlans),
          created_at: new Date().toISOString(),
        },

        // Overwrite if outing_id already exists
        { onConflict: "outing_id" }
      )
      .select("id")
      .single();

    if (saveErr) {
      console.error("Failed to save plan to DB:", saveErr);
      return res.status(500).json({ error: "Failed to save generated plan" });
    }

    console.log(" - Generated outing plan saved with ID:", savedPlan.id);
    // 5. Return the generated outing plan to the client
    res.json({
      success: true,
      plans: generatedPlans.plans,
      plan_id: savedPlan.id,
    });
    console.log("=== POST /api/generate-outing END ===");
  } catch (apiErr: any) {
    console.error("OpenAI API Error:", apiErr);
    return res.status(500).json({
      error: "Failed to generate outing plan",
      details: apiErr.message,
    });
  }
});

// GET /api/outings/:id/plan  -> normalized payload
router.get("/outings/:id/plan", async (req, res) => {
  try {
    const outingId = Number(req.params.id);
    if (!outingId) return res.status(400).json({ error: "Invalid id" });

    const { data, error } = await db
      .from("outing_plans")
      .select("plans, created_at, id, outing_id")
      .eq("outing_id", outingId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "No saved plan for this outing" });

    let raw = data.plans;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { raw = {}; }
    }

    const normalized = normalizePlans(raw);
    return res.json({
      plan_id: data.id,
      outing_id: data.outing_id,
      created_at: data.created_at,
      ...normalized,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});


export default router;
