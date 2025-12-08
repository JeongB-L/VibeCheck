import { supabase as db } from "../lib/supabase";
import { getNotificationPrefs } from "../utils/notification-prefs";
import { sendNotificationEmail } from "../utils/emails";

// helper: get creator + all members with email
async function getOutingUsersWithEmail(outingId: number) {
  const { data: outing, error: oErr } = await db
    .from("outings")
    .select("id, title, start_date, creator_id")
    .eq("id", outingId)
    .maybeSingle();

  if (oErr || !outing) return { outing: null, users: [] as any[] };

  const { data: members, error: mErr } = await db
    .from("outing_members")
    .select("user_id")
    .eq("outing_id", outingId);

  if (mErr) return { outing, users: [] as any[] };

  const userIds = Array.from(
    new Set<string>([
      String(outing.creator_id),
      ...(members || []).map((m: any) => String(m.user_id)),
    ])
  );

  if (!userIds.length) return { outing, users: [] as any[] };

  const { data: users, error: uErr } = await db
    .from("users")
    .select("user_id, email")
    .in("user_id", userIds);

  if (uErr || !users) return { outing, users: [] as any[] };

  return { outing, users };
}

export async function runOutingReminderJob() {
  const now = new Date();
  const todayMidnight = new Date(now.toDateString());
  const fourDaysOut = new Date(
    todayMidnight.getTime() + 4 * 24 * 60 * 60 * 1000
  );

  // outings starting between today and 3 days from now
  const { data: outings, error } = await db
    .from("outings")
    .select("id, title, start_date")
    .gte("start_date", todayMidnight.toISOString())
    .lt("start_date", fourDaysOut.toISOString());

  if (error || !outings) {
    console.error("Outing reminder job query error:", error?.message);
    return;
  }

  for (const outing of outings) {
    const outingDate = new Date(outing.start_date);
    const diffDays = Math.round(
      (outingDate.getTime() - todayMidnight.getTime()) /
        (24 * 60 * 60 * 1000)
    ); // 0..3

    if (![0, 1, 2, 3].includes(diffDays)) continue;

    const { outing: fullOuting, users } = await getOutingUsersWithEmail(
      outing.id
    );
    if (!fullOuting) continue;

    const whenLabel =
      diffDays === 0
        ? "today"
        : diffDays === 1
        ? "in 1 day"
        : `in ${diffDays} days`;

    for (const u of users) {
      if (!u.email) continue;

      const prefs = await getNotificationPrefs(String(u.user_id));

      // respect notification settings
      if (!prefs.emailEnabled || !prefs.outingEnabled) continue;

      await sendNotificationEmail({
        to: u.email,
        subject: `Outing reminder: ${fullOuting.title}`,
        text: `Your outing "${fullOuting.title}" is ${whenLabel}. Open VibeCheck to see the latest itinerary and details.`,
      });
    }
  }
}
