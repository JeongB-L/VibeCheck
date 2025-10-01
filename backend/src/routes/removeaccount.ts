import { Router } from "express";
import bcrypt from "bcryptjs";
import { supabase as supabaseClient } from "../lib/supabase";

const router = Router();

function getUserId(req: any): string | null {
  return req?.user?.user_id || (req.headers["x-user-id"] as string) || null;
}

router.delete("/account", async (req: any, res: any) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { password, confirm } = (req.body || {}) as {
      password?: string;
      confirm?: string;
    };

    if (!password) return res.status(400).json({ error: "Password required" });
    if (confirm !== "DELETE") {
      return res
        .status(400)
        .json({ error: 'Type "DELETE" in the confirm field to proceed' });
    }

    // fetch user for password verification
    const { data: user, error: findErr } = await supabaseClient
      .from("users")
      .select("user_id, password_hash")
      .eq("user_id", userId)
      .maybeSingle();

    if (findErr) return res.status(500).json({ error: findErr.message });
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok =
      user.password_hash &&
      (await bcrypt.compare(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // HARD DELETE
    const { error: delErr } = await supabaseClient
      .from("users")
      .delete()
      .eq("user_id", userId);

    if (delErr) return res.status(500).json({ error: delErr.message });

    return res.status(200).json({ message: "Account permanently deleted" });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? "Server error" });
  }
});

export default router;
