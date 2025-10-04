import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();
const googleClient = new OAuth2Client();

function randomPassword(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function issueSession(res: any, userId: string) {
  const secret = process.env.JWT_SECRET || "dev_secret_change_me";
  const token = jwt.sign({ uid: userId }, secret, { expiresIn: "7d" });
  res.cookie("sid", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, 
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

router.post("/auth/google", async (req, res) => {
  try {
    const credential: string | undefined = req.body?.credential;
    if (!credential) return res.status(400).json({ error: "Missing credential" });

    const audience = process.env.GOOGLE_CLIENT_ID;
    if (!audience) {
      return res.status(500).json({ error: "Server misconfigured: GOOGLE_CLIENT_ID missing" });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(401).json({ error: "Invalid Google token" });

    const email = payload.email.toLowerCase();
    const fn = (payload.given_name ?? "").trim();
    const ln = (payload.family_name ?? "").trim();

    const { data: existing, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, email_verified, first_name, last_name, verification_token")
      .eq("email", email)
      .maybeSingle();
    if (findErr) return res.status(500).json({ error: findErr.message });

    if (existing) {
      const update: Record<string, any> = { email_verified: true, verification_token: null };
      if (fn && !existing.first_name) update.first_name = fn;
      if (ln && !existing.last_name) update.last_name = ln;

      const { data: updated, error: updErr } = await supabaseClient
        .from("users")
        .update(update)
        .eq("user_id", existing.user_id)
        .select("user_id, email")
        .single();
      if (updErr) return res.status(500).json({ error: updErr.message });

      const token = issueSession(res, updated.user_id);
      return res.status(200).json({ user: updated, token, message: "Signed in with Google" });
    }

    const password_hash = await bcrypt.hash(randomPassword(), 10);
    const { data: created, error: insErr } = await supabaseClient
      .from("users")
      .insert([
        {
          email,
          password_hash,
          first_name: fn || null,
          last_name: ln || null,
          email_verified: true,
          verification_token: null,
        },
      ])
      .select("user_id, email")
      .single();
    if (insErr) return res.status(500).json({ error: insErr.message });

    const token = issueSession(res, created.user_id);
    return res.status(201).json({ user: created, token, message: "Account created via Google" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Server error" });
  }
});

export default router;