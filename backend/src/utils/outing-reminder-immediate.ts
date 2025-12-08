// backend/src/utils/outing-reminder-immediate.ts
import { supabase as db } from "../lib/supabase";
import { getNotificationPrefs } from "./notification-prefs";
import { sendNotificationEmail } from "./emails";

// MUST MATCH YOUR CRON HOUR (e.g. 18 == 6pm)
const DAILY_SEND_HOUR = 9;

/**
 * Send today's D-3..D0 outing reminder immediately
 * for given users, ONLY IF:
 *  - outing is between D-3 and D-0 (inclusive)
 *  - current time is AFTER DAILY_SEND_HOUR
 */
export async function maybeSendSameDayOutingReminder(
  outingId: number,
  userIds: string[]
) {
  try {
    const now = new Date();

    // If it's still before the daily send time, do nothing
    if (now.getHours() < DAILY_SEND_HOUR) {
      return;
    }

    const todayMidnight = new Date(now.toDateString());

    // Load outing
    const { data: outing, error: oErr } = await db
      .from("outings")
      .select("id, title, start_date")
      .eq("id", outingId)
      .maybeSingle();

    if (oErr || !outing) {
      console.error(
        "Immediate outing reminder: outing not found",
        oErr?.message
      );
      return;
    }

    const outingDate = new Date(outing.start_date);
    const diffDays = Math.round(
      (outingDate.getTime() - todayMidnight.getTime()) /
        (24 * 60 * 60 * 1000)
    );

    // Only if D-3..D0
    if (![0, 1, 2, 3].includes(diffDays)) return;

    const whenLabel =
      diffDays === 0
        ? "today"
        : diffDays === 1
        ? "in 1 day"
        : `in ${diffDays} days`;

    // Load users
    const { data: users, error: uErr } = await db
      .from("users")
      .select("user_id, email")
      .in("user_id", userIds);

    if (uErr || !users) {
      console.error(
        "Immediate outing reminder: users lookup failed",
        uErr?.message
      );
      return;
    }

    for (const u of users) {
      if (!u.email) continue;

      const prefs = await getNotificationPrefs(String(u.user_id));
      if (!prefs.emailEnabled || !prefs.outingEnabled) continue;

      await sendNotificationEmail({
        to: u.email,
        subject: `Outing reminder: ${outing.title}`,
        text: `Your outing "${outing.title}" is ${whenLabel}. Open VibeCheck to see the latest itinerary and details.`,
      });
    }
  } catch (e: any) {
    console.error("Immediate outing reminder error:", e?.message || e);
  }
}
