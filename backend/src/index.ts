import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

// IMPORTANT: import with an alias to avoid any name collisions
import { supabase as supabaseClient } from "./lib/supabase";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS + JSON
app.use(cors({ origin: ["http://localhost:4200", "http://127.0.0.1:4200"] }));
app.use(express.json());

// (Optional) PG pool for your /api/test-db and /api/setup endpoints.
// If you don't need raw SQL, you can delete pool + those routes.
const pool = process.env.SUPABASE_CONNECTION_STRING
  ? new Pool({ connectionString: process.env.SUPABASE_CONNECTION_STRING })
  : undefined;

// Simple request logger
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

// ---- Test DB (raw SQL via Pool) ----
app.get("/api/test-db", async (_req, res) => {
  if (!pool)
    return res
      .status(500)
      .json({
        type: "DATABASE",
        connected: false,
        error: "No pool configured",
      });
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() as time");
    client.release();
    res.json({ type: "DATABASE", connected: true, time: result.rows[0].time });
  } catch (error: any) {
    console.error("Database error:", error);
    res
      .status(500)
      .json({ type: "DATABASE", connected: false, error: error.message });
  }
});

// ---- Test Supabase client (table may not exist; error is fine) ----
app.get("/api/test-client", async (_req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from("test_table")
      .select("id, message")
      .limit(1);
    res.json({
      type: "CLIENT",
      connected: true,
      tableExists: !error,
      data: data || [],
      error: error ? error.message : null,
      note: error ? "Table doesn't exist yet (normal)" : "Success!",
    });
  } catch (error: any) {
    res.json({ type: "CLIENT", connected: false, error: error.message });
  }
});

// ---- Setup test table (raw SQL) ----
app.post("/api/setup", async (_req, res) => {
  if (!pool)
    return res
      .status(500)
      .json({ success: false, error: "No pool configured" });
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(
      `INSERT INTO test_table (message) VALUES ('Hello from Supabase!') ON CONFLICT DO NOTHING`
    );
    client.release();
    res.json({ success: true, message: "Test table created and populated!" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---- SIGNUP ----
app.post("/api/signup", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    console.log("📥 /api/signup body:", req.body);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log("⛔ invalid email:", email);
      return res.status(400).json({ error: "Valid email is required" });
    }

    const { data, error } = await supabaseClient
      .from("users") // public.users (your table)
      .insert([{ email }]) // user_id auto, created_at default
      .select()
      .single();

    if (error) {
      console.error("❌ insert error:", error);
      if ((error as any).code === "23505" || /duplicate/i.test(error.message)) {
        return res.status(409).json({ error: "Email already exists" });
      }
      return res.status(500).json({ error: error.message });
    }

    console.log("✅ inserted row:", data);
    return res.status(201).json({ user: data });
  } catch (e: any) {
    console.error("💥 signup handler failed:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// ---- SINGLE app.listen ----
app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`🤖 Test Client: http://localhost:${PORT}/api/test-client`);
  console.log(`⚙️ Setup: POST http://localhost:${PORT}/api/setup`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});
