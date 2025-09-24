import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { generate_random_password } from "./utils/random_password_generator";
import { sendVerificationEmail } from "./utils/emails";

// IMPORTANT: import with an alias to avoid any name collisions
import { supabase as supabaseClient } from "./lib/supabase";

dotenv.config({ path: path.join(__dirname, "../../.env") });

const app = express();
const PORT = process.env.PORT || 3001;

// CORS + JSON
app.use(cors({ origin: ["http://localhost:4200", "http://127.0.0.1:4200"] }));
app.use(express.json());

function passwordPolicyError(pw: string | undefined): string | null {
  if (!pw || pw.trim().length === 0) return "Password cannot be empty";
  // if (pw.length < 8) return 'Password must be at least 8 characters';
  //if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter';
  // if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter';
  // if (!/[0-9]/.test(pw)) return 'Password must include a number';
  return null;
}

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
    return res.status(500).json({
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

app.post("/api/reset_password", async (req, res) => {
  try {
    console.log("Reset password request body:", req.body);

    // Extract email from request body
    const { email } = req.body as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // Check if user with the provided email exists
    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email") // only need user_id and email here
      .eq("email", email)
      .maybeSingle();

    if (findErr) {
      console.error("Find user error:", findErr);
      return res.status(500).json({ error: findErr.message });
    }

    if (!user) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    // Generate random password
    const newPassword = generate_random_password(12);
    console.log(`Generated password for ${email}: ${newPassword}`);

    // Hash the new password
    const password_hash = await bcrypt.hash(newPassword, 10);

    // Update user's password in the database
    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ password_hash })
      .eq("user_id", user.user_id);

    if (updErr) {
      console.error("Update password error:", updErr);
      return res.status(500).json({ error: updErr.message });
    }
    console.log(`Password updated for user ${email} with ${password_hash}`);

    // Send email with the new password
    try {
      await sendVerificationEmail({
        to: email,
        subject: "Your Password Has Been Reset",
        name: email.split("@")[0] ?? "there",
        verificationUrl: `http://localhost:4200/login`,
        token: newPassword, // Using the token field to send the new password
      });
      console.log(`Reset email sent to ${email}`);
    } catch (mailErr: any) {
      console.error("Email send failed:", mailErr?.message || mailErr);
      return res.status(500).json({ error: "Failed to send reset email" });
    }

    return res.status(200).json({
      message:
        "Password reset successfully. Check your email for the new password.",
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    const normalized = (email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (typeof password !== "string") {
      return res.status(400).json({ error: "Password cant be empty" });
    }

    const pwErr = passwordPolicyError(password);
    if (pwErr) {
      return res.status(400).json({ error: pwErr });
    }

    // Does a user already exist?
    const { data: existing, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, email_verified")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) {
      console.error("Find user error:", findErr);
      return res.status(500).json({ error: findErr.message });
    }

    // helper to create and send code
    const sendCode = async (emailTo: string, userId?: string) => {
      const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const tokenNum = Number(tokenStr);

      if (userId) {
        const { error: updErr } = await supabaseClient
          .from("users")
          .update({ verification_token: tokenNum })
          .eq("user_id", userId);
        if (updErr) throw updErr;
      }

      try {
        await sendVerificationEmail({
          to: emailTo,
          subject: "Verify your email",
          name: emailTo.split("@")[0] ?? "there",
          verificationUrl: `http://localhost:4200/verify?email=${encodeURIComponent(
            emailTo
          )}`,
          token: tokenStr,
        });
      } catch (mailErr: any) {
        console.error("Email send failed:", mailErr?.message || mailErr);
      }
    };

    if (existing) {
      // If already verified then tell them to log in
      if (existing.email_verified) {
        return res.status(409).json({
          error: "Email already exists. Please log in.",
          code: "EXISTS_VERIFIED",
        });
      }
      // Exists but not verified then resend code, guide to /verify
      await sendCode(normalized, existing.user_id);
      return res.status(200).json({
        message: "Account exists but is not verified. We sent you a new code.",
        code: "RESENT_CODE",
        user: { email: normalized },
      });
    }

    // New user then create row and send code
    const password_hash = await bcrypt.hash(password, 10);
    const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenNum = Number(tokenStr);

    const { data: created, error: insErr } = await supabaseClient
      .from("users")
      .insert([
        { email: normalized, password_hash, verification_token: tokenNum },
      ])
      .select("user_id, email")
      .single();

    if (insErr) {
      console.error("Insert error:", insErr);
      return res.status(500).json({ error: insErr.message });
    }

    try {
      await sendVerificationEmail({
        to: normalized,
        subject: "Verify your email",
        name: normalized.split("@")[0] ?? "there",
        verificationUrl: `http://localhost:4200/verify?email=${encodeURIComponent(
          normalized
        )}`,
        token: tokenStr,
      });
    } catch {}

    return res.status(201).json({ user: created });
  } catch (e: any) {
    console.error("signup failed:", e);
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

app.post("/api/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body as {
      email?: string;
      code?: string | number;
    };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    const codeStr = String(code ?? "").trim();
    if (!/^\d{6}$/.test(codeStr)) {
      return res.status(400).json({ error: "Code must be 6 digits" });
    }

    // fetch user
    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, verification_token, email_verified")
      .eq("email", email)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified) {
      return res.status(200).json({ ok: true, alreadyVerified: true });
    }
    if (user.verification_token == null) {
      return res.status(400).json({ error: "No verification code on file" });
    }

    // compare
    if (Number(codeStr) !== Number(user.verification_token)) {
      return res.status(401).json({ error: "Invalid code" });
    }

    // mark verified and clear token
    const { data: updated, error: updErr } = await supabaseClient
      .from("users")
      .update({ email_verified: true, verification_token: null })
      .eq("user_id", user.user_id)
      .select("user_id, email, email_verified")
      .single();

    if (updErr) return res.status(500).json({ error: updErr.message });

    return res.status(200).json({ ok: true, user: updated });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

app.post("/api/resend-code", async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    const normalized = (email ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    // find user
    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, email_verified")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user)
      return res
        .status(404)
        .json({ error: "No account found for this email." });
    if (user.email_verified) {
      return res
        .status(409)
        .json({ error: "Email already verified. Please log in." });
    }

    // new 6-digit code
    const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenNum = Number(tokenStr);

    // update token
    const { error: updErr } = await supabaseClient
      .from("users")
      .update({ verification_token: tokenNum })
      .eq("user_id", user.user_id);

    if (updErr) return res.status(500).json({ error: updErr.message });

    // send email
    try {
      await sendVerificationEmail({
        to: normalized,
        subject: "Your new verification code",
        name: normalized.split("@")[0] ?? "there",
        verificationUrl: `http://localhost:4200/verify?email=${encodeURIComponent(
          normalized
        )}`,
        token: tokenStr,
      });
    } catch (mailErr: any) {
      console.error("Email send failed:", mailErr?.message || mailErr);
      return res.status(200).json({ ok: true, emailSent: false });
    }

    return res.status(200).json({ ok: true, emailSent: true });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

// ---- LOGIN ----
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const bcrypt = require("bcryptjs");
    //normal
    const normalized = email.trim().toLowerCase();

    const { data: user, error } = await supabaseClient
      .from("users")
      .select("user_id, email, password_hash, email_verified")
      .eq("email", normalized)
      .single();

    if (error || !user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    //checker
    if (!user.email_verified) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "NOT_VERIFIED",
        user: { email: user.email }, // helpful for client to prefill /verify
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    return res
      .status(200)
      .json({ user: { user_id: user.user_id, email: user.email } });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});
// ---- SINGLE app.listen ----
app.listen(PORT, () => {
  console.log("====================================");
  console.log(`____   ____._____.          _________ .__                   __    
\\   \\ /   /|__\\_ |__   ____ \\_   ___ \\|  |__   ____   ____ |  | __
 \\   Y   / |  || __ \\_/ __ \\/    \\  \\/|  |  \\_/ __ \\_/ ___\\|  |/ /
  \\     /  |  || \\_\\ \\  ___/\\     \\___|   Y  \\  ___/\\  \\___|    < 
   \\___/   |__||___  /\\___  >\\______  /___|  /\\___  >\\___  >__|_ \\
                   \\/     \\/        \\/     \\/     \\/     \\/     \\/`);
  console.log("====================================");
  console.log(
    "\n\n Followings are simple endpoints for testing if the server is functional or not:\n"
  );
  console.log(`🚀 Server: http://localhost:${PORT}`);
  console.log(`🔍 Test DB: http://localhost:${PORT}/api/test-db`);
  console.log(`🤖 Test Client: http://localhost:${PORT}/api/test-client`);
  console.log(`⚙️ Setup: POST http://localhost:${PORT}/api/setup`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});
