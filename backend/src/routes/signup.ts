import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { supabase as supabaseClient } from "../lib/supabase";
import { sendVerificationEmail } from "../utils/emails";

const router = Router();

// small helper copied from your file
function passwordPolicyError(pw: string | undefined): string | null {
  if (!pw || pw.trim().length === 0) return "Password cannot be empty";
  return null;
}

router.post("/signup", async (req, res) => {
  try {
    const { email, password, first_name, last_name, date_of_birth, gender } =
      req.body as {
        email?: string;
        password?: string;
        first_name?: string;
        last_name?: string;
        date_of_birth?: string;
        gender?: string | null;
      };

    const normalized = (email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const pwErr = passwordPolicyError(password);
    if (pwErr) return res.status(400).json({ error: pwErr });

    const fn = (first_name ?? "").trim();
    const ln = (last_name ?? "").trim();
    if (!fn || !ln) {
      return res
        .status(400)
        .json({ error: "First and last name are required" });
    }

    let dob: string | null = null;
    if (date_of_birth) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
        return res
          .status(400)
          .json({ error: "date_of_birth must be in proper form" });
      }
      dob = date_of_birth;
    }

    const allowed = new Set([
      "male",
      "female",
      "non-binary",
      "nonbinary",
      "other",
      "",
    ]);
    let g: string | null = gender?.toString().trim().toLowerCase() ?? null;
    if (g && !allowed.has(g)) g = "other";
    if (g === "") g = null;

    const { data: existing, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, email, email_verified")
      .eq("email", normalized)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });

    // shared code sender
    const tokenStr = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const tokenNum = Number(tokenStr);

    const sendCode = async (emailTo: string, userId?: string) => {
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
          name: fn || emailTo.split("@")[0] || "there",
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
      if (existing.email_verified) {
        return res.status(409).json({
          error: "Email already exists. Please log in.",
          code: "EXISTS_VERIFIED",
        });
      }

      const { error: updErr2, data: updatedUser } = await supabaseClient
        .from("users")
        .update({
          first_name: fn,
          last_name: ln,
          date_of_birth: dob,
          gender: g,
          verification_token: tokenNum,
        })
        .eq("user_id", existing.user_id)
        .select("user_id, email")
        .single();

      if (updErr2) return res.status(500).json({ error: updErr2.message });

      await sendCode(normalized);
      return res.status(200).json({
        message:
          "Account exists but is not verified. We updated your info and sent a new code.",
        code: "RESENT_CODE",
        user: updatedUser,
      });
    }

    // new user
    const password_hash = await bcrypt.hash(password!, 10);
    const { data: created, error: insErr } = await supabaseClient
      .from("users")
      .insert([
        {
          email: normalized,
          password_hash,
          verification_token: tokenNum,
          first_name: fn,
          last_name: ln,
          date_of_birth: dob,
          gender: g,
        },
      ])
      .select("user_id, email")
      .single();

    if (insErr) return res.status(500).json({ error: insErr.message });

    await sendCode(normalized);
    return res.status(201).json({ user: created });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
