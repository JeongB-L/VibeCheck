import { Router } from "express";
import multer from "multer";
import { supabase as db } from "../lib/supabase";
import { publicUrlFromPath } from "../utils/storage";

const router = Router();

// --- Setup Multer for File Uploads (Memory Storage) ---
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // Limit: 20MB
});

// --- Helper: Get User ID from Email ---
async function getUserIdFromEmail(email: string): Promise<string> {
  if (!email || !email.includes("@")) throw new Error("Invalid email");

  const { data, error } = await db
    .from("users")
    .select("user_id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (error || !data) throw new Error("User not found");
  return data.user_id;
}

// GET /api/highlights
// Fetch the global feed (all posts from everyone, or filter by user)
router.get("/", async (req, res) => {
  try {
    const email = String(req.query.email || "");
    const userId = await getUserIdFromEmail(email);

    // 1. Fetch Posts + Authors + Outing Info
    // We explicitly join relations to get the data we need in one go
    const { data: posts, error } = await db
      .from("highlight_posts")
      .select(
        `
        *,
        user:users(first_name, last_name, email, profiles(avatar_path, display_name)),
        outing:outings(title),
        likes:highlight_likes(count),
        comments:highlight_comments(
          id, content, created_at,
          user:users(first_name, last_name, email, profiles(display_name))
        )
      `
      )
      .order("created_at", { ascending: false }) // Newest first
      .limit(50);

    if (error) throw error;

    // 2. Determine which posts the logged in user has liked
    const postIds = posts.map((p) => p.id);
    let likedPostIds = new Set<number>();

    if (postIds.length > 0) {
      const { data: myLikes } = await db
        .from("highlight_likes")
        .select("post_id")
        .eq("user_id", userId)
        .in("post_id", postIds);

      (myLikes || []).forEach((l) => likedPostIds.add(l.post_id));
    }

    // Format a post object for frontend.
    const formattedPosts = posts.map((p: any) => {
      // Name resolution
      const u = p.user || {};
      const profile = u.profiles || {};
      const userName =
        profile.display_name ||
        [u.first_name, u.last_name].join(" ").trim() ||
        u.email;

      return {
        id: p.id,
        user_name: userName,
        user_avatar: publicUrlFromPath(profile.avatar_path),
        location: p.location_name,
        image_url: publicUrlFromPath(p.image_path, "outing-highlights"),
        caption: p.caption,
        timestamp: p.created_at,
        likes: p.likes?.[0]?.count || 0,
        liked_by_me: likedPostIds.has(p.id),
        comments: (p.comments || []).map((c: any) => ({
          id: c.id,
          user:
            c.user?.profiles?.display_name || c.user?.first_name || "Unknown",
          text: c.content,
        })),
        outing_title: p.outing?.title || null,
      };
    });

    res.json({ posts: formattedPosts });
  } catch (e: any) {
    console.error("GET /highlights error:", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
});

// 2. POST /api/highlights
// Create a new post (Upload photo -> Save to DB -> supabase bucket)
router.post("/", upload.single("photo"), async (req: any, res: any) => {
  try {
    const { email, caption, location, outingId } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No photo uploaded" });

    const userId = await getUserIdFromEmail(email);

    // 1. Upload file to Supabase Storage
    // Path format: public/user_id/timestamp_filename
    const fileExt = file.originalname.split(".").pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await db.storage
      .from("outing-highlights")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) throw uploadError;

    // 2. Insert Record into DB
    const { data, error: dbError } = await db
      .from("highlight_posts")
      .insert({
        user_id: userId,
        outing_id: outingId ? Number(outingId) : null,
        image_path: fileName,
        caption: caption,
        location_name: location,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.status(201).json({ success: true, post: data });
  } catch (e: any) {
    console.error("POST /highlights error:", e);
    res.status(500).json({ error: e.message || "Upload failed" });
  }
});

// 3. POST /api/highlights/:id/like
// Toggle Like (Like / Unlike)
router.post("/:id/like", async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { email } = req.body;
    const userId = await getUserIdFromEmail(email);

    // Check if already liked
    const { data: existing } = await db
      .from("highlight_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    // If already liked, we unlike; drop the row.
    if (existing) {
      // UNLIKE: Remove the row
      await db.from("highlight_likes").delete().eq("id", existing.id);
      return res.json({ liked: false });
    } else {
      // LIKE: Insert new row
      await db.from("highlight_likes").insert({
        post_id: postId,
        user_id: userId,
      });
      return res.json({ liked: true });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 4. POST /api/highlights/:id/comment
// Add a comment
router.post("/:id/comment", async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { email, text } = req.body;

    if (!text || !text.trim())
      return res.status(400).json({ error: "Empty comment" });

    const userId = await getUserIdFromEmail(email);

    const { data, error } = await db
      .from("highlight_comments")
      .insert({
        post_id: postId,
        user_id: userId,
        content: text,
      })
      .select(
        `
        id, content, created_at,
        user:users(first_name, last_name, profiles(display_name))
      `
      )
      .single();

    if (error) throw error;

    // Return the formatted comment so frontend can display it immediately
    const c = data as any;
    const formattedComment = {
      id: c.id,
      user: c.user?.profiles?.display_name || c.user?.first_name || "Me",
      text: c.content,
    };

    res.json({ comment: formattedComment });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
