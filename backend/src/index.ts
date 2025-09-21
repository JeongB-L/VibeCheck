import express from "express";
import * as os from "os";
import { config as load_dotenv } from "dotenv";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js"; // Add SupabaseClient type import

dotenv.config();

load_dotenv();

const app = express();
const PORT = process.env.PORT || 3001;

// Debug: Check environment variables
console.log("Environment check:");
console.log(
  "SUPABASE_CONNECTION_STRING:",
  !!process.env.SUPABASE_CONNECTION_STRING
);
console.log("SUPABASE_PROJECT_URL:", !!process.env.SUPABASE_PROJECT_URL);
console.log("SUPABASE_KEY:", !!process.env.SUPABASE_KEY);

// Middleware
app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());

// PostgreSQL connection (Supabase)
// Basically uses the pool provided by supabase and it is used for raw SQL queries
const pool = new Pool({
  connectionString: process.env.SUPABASE_CONNECTION_STRING,
});

// Supabase client
let supabase: SupabaseClient | undefined;
try {
  supabase = createClient(
    process.env.SUPABASE_PROJECT_URL!,
    process.env.SUPABASE_KEY!
  );
  console.log("✅ Supabase client created");
} catch (error) {
  console.error("❌ Supabase client failed:", error);
}

// Test 1: Database connection (raw SQL)
app.get("/api/test-db", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT NOW() as time");
    client.release();

    res.json({
      type: "DATABASE",
      connected: true,
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      type: "DATABASE",
      connected: false,
      error: (error as Error).message,
    });
  }
});

// Test 2: Supabase client
app.get("/api/test-client", async (req, res) => {
  try {
    if (!supabase) {
      throw new Error("Supabase client not initialized");
    }

    // Simple ping test first
    const { data: pingData } = await supabase
      .from("test_table")
      .select("tablename")
      .limit(1);

    const { data, error } = await supabase
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
  } catch (error) {
    res.json({
      type: "CLIENT",
      connected: true,
      error: (error as Error).message,
      note: "Connection works, query failed",
    });
  }
});

// Setup endpoint - Create test table using raw SQL
app.post("/api/setup", async (req, res) => {
  try {
    const client = await pool.connect();

    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Insert test data
    await client.query(`
      INSERT INTO test_table (message) 
      VALUES ('Hello from Supabase!') 
      ON CONFLICT DO NOTHING
    `);

    // Doesnt close db connection; simply makes the connection available for other requests
    client.release();

    res.json({
      success: true,
      message: "Test table created and populated!",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Server is running!",
    env: {
      hasConnectionString: !!process.env.SUPABASE_CONNECTION_STRING,
      hasProjectUrl: !!process.env.SUPABASE_PROJECT_URL,
      hasKey: !!process.env.SUPABASE_KEY,
    },
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`🤖 Test Client: http://localhost:${PORT}/api/test-client`);
  console.log(`⚙️ Setup: POST http://localhost:${PORT}/api/setup`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});
