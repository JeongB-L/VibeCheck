import { Router } from "express";
import { supabase as db } from "../lib/supabase";
import { uploadAvatar } from "../middleware/upload";
import { uploadAvatarToStorage, publicUrlFromPath } from "../utils/storage";

const router = Router();

/** Ensure a profile row exists for a user_id */
async function ensureProfile(user_id: string) {
  const { data, error } = await db
    .from("profiles")
    .select("user_id")
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
    .select("display_name, username, bio, avatar_path, updated_at")
    .eq("user_id", user.user_id)
    .maybeSingle();
  if (pErr) return res.status(500).json({ error: pErr.message });

  return res.json({
    email: user.email,
    first_name: user.first_name ?? null,
    last_name: user.last_name ?? null,
    profile: {
      ...profile,
      avatar_url: publicUrlFromPath(profile?.avatar_path),
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

    // (optional) read current to delete later
    const { data: current } = await db
      .from("profiles")
      .select("avatar_path")
      .eq("user_id", user.user_id)
      .maybeSingle();

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

    // delete old (best-effort)
    if (current?.avatar_path && current.avatar_path !== newPath) {
      await db.storage
        .from("avatars")
        .remove([current.avatar_path])
        .catch(() => {});
    }

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

export default router;
