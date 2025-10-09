import { Router } from "express";
import { supabase as db } from "../lib/supabase";

const router = Router();

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
router.get("/outings", async (req, res) => {
  try {
    console.log("=== GET /api/outings START ===");
    console.log("Query params:", req.query);
    
    const email = String(req.query.email ?? "").trim().toLowerCase();
    console.log("Email extracted:", email);
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log("❌ Invalid email format");
      return res.status(400).json({ error: "Valid email is required" });
    }

    console.log("✅ Email format valid, looking up user...");
    const userId = await getUserIdFromEmail(email);
    console.log("User ID found:", userId);
    
    if (!userId) {
      console.log("❌ User not found in database");
      return res.status(401).json({ error: "User not found" });
    }

    console.log("✅ User found, querying outings...");
    const { data, error } = await db
      .from("outings")
      .select("*")
      .eq("creator_id", userId)
      .order("start_date", { ascending: true });

    if (error) {
      console.error("❌ Database query error:", error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log("✅ Query successful, data:", data);
    console.log("=== GET /api/outings END ===");
    res.json({ outings: data ?? [] });
  } catch (e: any) {
    console.error("❌ GET /api/outings exception:", e);
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

    const { data, error } = await db
      .from("outings")
      .select("*")
      .eq("id", id)
      .eq("creator_id", userId)
      .maybeSingle();            // ← returns null when not found

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Not found" });

    return res.json({ outing: data });
  } catch (e: any) {
    console.error("GET /outings/:id error", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});


export default router;
