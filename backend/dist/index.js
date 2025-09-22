"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
const supabase_js_1 = require("@supabase/supabase-js"); // Add SupabaseClient type import
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Debug: Check environment variables
console.log("🔍 Environment check:");
console.log("SUPABASE_CONNECTION_STRING:", !!process.env.SUPABASE_CONNECTION_STRING);
console.log("SUPABASE_PROJECT_URL:", !!process.env.SUPABASE_PROJECT_URL);
console.log("SUPABASE_KEY:", !!process.env.SUPABASE_KEY);
// Middleware
app.use((0, cors_1.default)({ origin: "http://localhost:4200" }));
app.use(express_1.default.json());
// PostgreSQL connection (Supabase)
const pool = new pg_1.Pool({
    connectionString: process.env.SUPABASE_CONNECTION_STRING,
});
// Supabase client
let supabase; // Explicit type: SupabaseClient or undefined
try {
    supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_PROJECT_URL, process.env.SUPABASE_KEY);
    console.log("✅ Supabase client created");
}
catch (error) {
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
    }
    catch (error) {
        console.error("Database error:", error);
        res.status(500).json({
            type: "DATABASE",
            connected: false,
            error: error.message,
        });
    }
});
// Test 2: Supabase client (fixed - no RPC call)
app.get("/api/test-client", async (req, res) => {
    try {
        if (!supabase) {
            throw new Error("Supabase client not initialized");
        }
        // Simple ping test first
        const { data: pingData, error: pingError } = await supabase
            .from("pg_tables")
            .select("tablename")
            .limit(1);
        if (pingError && !pingError.message.includes("does not exist")) {
            throw pingError;
        }
        // Try to query test_table (will fail if doesn't exist - that's okay)
        const { data, error } = await supabase
            .from("test_table")
            .select("id, message")
            .limit(1);
        res.json({
            type: "CLIENT",
            connected: true,
            pingWorked: !pingError,
            tableExists: !error,
            data: data || [],
            error: error ? error.message : null,
            note: error ? "Table doesn't exist yet (normal)" : "Success!",
        });
    }
    catch (error) {
        res.json({
            type: "CLIENT",
            connected: true,
            error: error.message,
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
        client.release();
        res.json({
            success: true,
            message: "Test table created and populated!",
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
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
