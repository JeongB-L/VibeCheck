import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { supabase as supabaseClient } from "../lib/supabase";
import jwt from "jsonwebtoken";
import { sendVerificationEmail } from "../utils/emails";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalized = email.trim().toLowerCase();
    const { data: user, error } = await supabaseClient
      .from("users")
      .select("user_id, email, password_hash, email_verified, first_name, status")
      .eq("email", normalized)
      .single();

    if (error || !user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    
    if (user.status === "DEACTIVATED") {
      return res.status(401).json({
        error: "Account is deactivated",
        code: "ACCOUNT_DEACTIVATED",
      });
    }
    
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.email_verified) {

      const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const tokenNum = Number(tokenStr);

      // save the new token on the user
      const { error: updErr } = await supabaseClient
        .from("users")
        .update({ verification_token: tokenNum })
        .eq("user_id", user.user_id);


      if (!updErr) {
        // try to send the email (don’t fail login flow if mailer errors)
        try {
          await sendVerificationEmail({
            to: user.email,
            subject: "Verify your email",
            name: user.first_name || user.email.split("@")[0] || "there",
            verificationUrl: `http://localhost:4200/verify?email=${encodeURIComponent(user.email)}`,
            token: tokenStr,
          });
        } catch (mailErr) {
          console.error("Login auto-resend failed:", mailErr);
        }
      }
      

      return res.status(403).json({
        error: "Please verify your email before logging in.",
        code: "NOT_VERIFIED",
        user: { email: user.email },
        resent: true, //nicer toast
      });
    }


    // Generate a JWT token
    const token = jwt.sign(
      { user_id: user.user_id, email: user.email },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "1h" }
    );

    return res
      .status(200)
      .json({ user: { user_id: user.user_id, email: user.email }, token, });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
