import { Router } from "express";
import { supabase as db } from "../lib/supabase";
import { uploadAvatar } from "../middleware/upload";
import { uploadAvatarToStorage, publicUrlFromPath } from "../utils/storage";
import { resolve } from "path";

const router = Router();

/** Ensure a profile row exists for a user_id */
async function ensureProfile(user_id: string) {
  const { data, error } = await db
    .from("profiles")
    .select("user_id, idle_timeout_minutes")
    .eq("user_id", user_id)
    .maybeSingle();
  if (!data) {
    const { error: insErr } = await db.from("profiles").insert([{ user_id }]);
    if (insErr) throw insErr;
  } else if (error) {
    throw error;
  }
}

/** GET /api/profile/me?email=... */
router.get("/profile/me", async (req, res) => {
  const email = String(req.query.email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const { data: user, error: uErr } = await db
    .from("users")
    .select("user_id, email, first_name, last_name")
    .eq("email", email)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!user) return res.status(404).json({ error: "User not found" });

  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select(
      "display_name, username, bio, avatar_path, preferences, updated_at, idle_timeout_minutes"
    )
    .eq("user_id", user.user_id)
    .maybeSingle();
  if (pErr) return res.status(500).json({ error: pErr.message });

  // Normalize preferences: return an array to the client
  let prefsArr: string[] = [];
  const raw = profile?.preferences;
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      prefsArr = JSON.parse(raw);
    } catch {
      prefsArr = [];
    }
  } else if (Array.isArray(raw)) {
    prefsArr = raw.filter((x: any) => typeof x === "string");
  }

  return res.json({
    email: user.email,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    profile: {
      display_name: profile?.display_name ?? null,
      username: profile?.username ?? null,
      bio: profile?.bio ?? null,
      avatar_path: profile?.avatar_path ?? null,
      avatar_url: publicUrlFromPath(profile?.avatar_path),
      preferences: prefsArr,
      updated_at: profile?.updated_at ?? null,
      idle_timeout_minutes: profile?.idle_timeout_minutes ?? 5,
    },
  });
});

/** PATCH /api/profile  { email, display_name?, username?, bio? } */
router.patch("/profile", async (req, res) => {
  const { email, display_name, username, bio } = req.body || {};
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const { data: user, error: uErr } = await db
    .from("users")
    .select("user_id")
    .eq("email", normalized)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!user) return res.status(404).json({ error: "User not found" });

  await ensureProfile(user.user_id);

  const { data, error } = await db
    .from("profiles")
    .update({
      display_name: display_name ?? null,
      username: username ?? null,
      bio: bio ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.user_id)
    .select("display_name, username, bio, avatar_path, updated_at")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    profile: { ...data, avatar_url: publicUrlFromPath(data.avatar_path) },
  });
});

router.post("/profile/avatar", uploadAvatar, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: "Image file is required" });

    console.log("[avatar] incoming", {
      email,
      mimetype: file.mimetype,
      size: file.size,
    });

    const { data: user, error: uErr } = await db
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    // ensure row exists
    await ensureProfile(user.user_id);

    // // (optional) read current to delete later  // Commented out to preserve old avatars for history
    // const { data: current } = await db
    //   .from("profiles")
    //   .select("avatar_path")
    //   .eq("user_id", user.user_id)
    //   .maybeSingle();

    // upload new
    const newPath = await uploadAvatarToStorage(user.user_id, file);

    // save path
    const { data: updated, error: updErr } = await db
      .from("profiles")
      .update({ avatar_path: newPath, updated_at: new Date().toISOString() })
      .eq("user_id", user.user_id)
      .select("avatar_path")
      .single();
    if (updErr) return res.status(500).json({ error: updErr.message });

    // // delete old (best-effort)  // Commented out to preserve old avatars for history
    // if (current?.avatar_path && current.avatar_path !== newPath) {
    //   await db.storage
    //     .from("avatars")
    //     .remove([current.avatar_path])
    //     .catch(() => {});
    // }

    const url = publicUrlFromPath(updated.avatar_path);
    console.log("[avatar] stored", { path: updated.avatar_path, url });

    return res.json({
      ok: true,
      avatar_url: url,
      avatar_path: updated.avatar_path,
    });
  } catch (e: any) {
    console.error("[avatar] failed", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

/** PUT /api/profile/preferences { email, preferences: string[] } */
router.put("/profile/preferences", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const preferences = req.body?.preferences;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (
      !Array.isArray(preferences) ||
      !preferences.every((x: any) => typeof x === "string")
    ) {
      return res
        .status(400)
        .json({ error: "preferences must be an array of strings" });
    }

    const { data: user, error: uErr } = await db
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    await ensureProfile(user.user_id);

    const { data, error } = await db
      .from("profiles")
      .update({
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.user_id)
      .select("preferences")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, preferences: data.preferences });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

/** PUT /api/profile/idle-timeout  { email: string, minutes: number } */
router.put("/profile/idle-timeout", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const minutes = Number(req.body?.minutes);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 720) {
      return res
        .status(400)
        .json({ error: "minutes must be a positive integer ≤ 720" });
    }

    const { data: user, error: uErr } = await db
      .from("users")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    await ensureProfile(user.user_id);

    const { data, error } = await db
      .from("profiles")
      .update({
        idle_timeout_minutes: Math.floor(minutes),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.user_id)
      .select("idle_timeout_minutes")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, idle_timeout_minutes: data.idle_timeout_minutes });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

/** GET /api/profile/history?email=... */
router.get("/profile/history", async (req, res) => {
  // Retrieve profile change history for a user
  const email = String(req.query.email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email is required" });
  }

  const { data: user, error: uErr } = await db
    .from("users")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!user) return res.status(404).json({ error: "User not found" });

  const { data: history, error: hErr } = await db
    .from("profile_history")
    .select("*")
    .eq("user_id", user.user_id)
    .order("history_timestamp", { ascending: false })
    .limit(10);

  if (hErr) return res.status(500).json({ error: hErr.message });

  // Transform for client
  const transformed = history.map((row) => ({
    ...row,
    avatar_url: publicUrlFromPath(row.avatar_path),
  }));

  return res.json({ history: transformed });
});

/** POST /api/profile/restore { email, history_id } */
router.post("/profile/restore", async (req, res) => {
  // Restore a previous profile version from history
  const { email, history_id } = req.body || {};
  const normalized = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return res.status(400).json({ error: "Valid email is required" });
  }
  if (!Number.isInteger(history_id) || history_id <= 0) {
    return res.status(400).json({ error: "Valid history_id is required" });
  }

  const { data: user, error: uErr } = await db
    .from("users")
    .select("user_id")
    .eq("email", normalized)
    .maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Fetch the historical version
  const { data: version, error: vErr } = await db
    .from("profile_history")
    .select("*")
    .eq("history_id", history_id)
    .eq("user_id", user.user_id)
    .maybeSingle();
  if (vErr) return res.status(500).json({ error: vErr.message });
  if (!version) return res.status(404).json({ error: "Version not found" });

  // Restore by updating profiles (this will trigger a new history entry automatically)
  const { error: updErr } = await db
    .from("profiles")
    .update({
      display_name: version.display_name,
      username: version.username,
      bio: version.bio,
      avatar_path: version.avatar_path,
      preferences: version.preferences,
      idle_timeout_minutes: version.idle_timeout_minutes,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.user_id);

  if (updErr) return res.status(500).json({ error: updErr.message });

  res.json({ ok: true });
});

// GET /api/profile/public/:id  -> public view by user_id
router.get("/profile/public/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return res
        .status(400)
        .json({ error: "Valid user_id (UUID) is required" });
    }

    // basic user + profile
    const { data: user, error: uErr } = await db
      .from("users")
      .select(
        "user_id, email, first_name, last_name, profiles(display_name, username, bio, avatar_path, preferences, updated_at)"
      )
      .eq("user_id", id)
      .maybeSingle();

    if (uErr) return res.status(500).json({ error: uErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    const p = (user as any).profiles || {};
    const prefsArr = Array.isArray(p?.preferences)
      ? p.preferences.filter((x: any) => typeof x === "string")
      : [];

    return res.json({
      user_id: user.user_id,
      email: user.email,
      name: [user.first_name, user.last_name].filter(Boolean).join(" "),
      display_name: p.display_name ?? null,
      username: p.username ?? null,
      bio: p.bio ?? null,
      avatar_url: publicUrlFromPath(p.avatar_path),
      preferences: prefsArr,
      updated_at: p.updated_at ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
