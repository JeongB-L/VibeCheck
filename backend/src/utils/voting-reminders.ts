// backend/src/utils/voting-reminders.ts
import { supabase as db } from "../lib/supabase";
import { sendNotificationEmail } from "./emails";
import { getNotificationPrefs } from "./notification-prefs";

function now() {
  return new Date();
}

// -----------------------------------------------------------
// Fetch users of outing (creator + members)
// -----------------------------------------------------------
async function getOutingUsers(outingId: number) {
  const { data: outing } = await db
    .from("outings")
    .select("creator_id")
    .eq("id", outingId)
    .maybeSingle();

  const { data: members } = await db
    .from("outing_members")
    .select("user_id")
    .eq("outing_id", outingId);

  const ids = new Set<string>();
  if (outing?.creator_id) ids.add(String(outing.creator_id));
  for (const m of members || []) ids.add(String(m.user_id));

  const { data: users } = await db
    .from("users")
    .select("user_id, email")
    .in("user_id", Array.from(ids));

  return users || [];
}

// -----------------------------------------------------------
// Has the user already voted on this outing?
// -----------------------------------------------------------
async function userHasVoted(outingId: number, userId: string) {
  const { data } = await db
    .from("outing_votes")
    .select("id")
    .eq("outing_id", outingId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(data);
}

// -----------------------------------------------------------
// Send "voting started" email (once)
// -----------------------------------------------------------
export async function sendVotingStartEmails(outingId: number) {
  const { data: outing } = await db
    .from("outings")
    .select("title, voting_start_at, voting_end_at")
    .eq("id", outingId)
    .maybeSingle();

  if (!outing) return;

  const users = await getOutingUsers(outingId);

  for (const u of users) {
    const prefs = await getNotificationPrefs(String(u.user_id));
    if (!prefs.emailEnabled || !prefs.votingEnabled) continue;

    const hasVoted = await userHasVoted(outingId, u.user_id);
    if (hasVoted) continue;

    await sendNotificationEmail({
      to: u.email,
      subject: `Voting started for ${outing.title}`,
      text: `Voting for "${outing.title}" has started. Please submit your vote!`
    });
  }
}

// -----------------------------------------------------------
// Voting reminder every 30 minutes
// -----------------------------------------------------------
export async function runVotingReminderJob() {
  const nowTs = now().getTime();

  const { data: outings } = await db
    .from("outings")
    .select("id, title, voting_start_at, voting_end_at")
    .not("voting_start_at", "is", null)
    .not("voting_end_at", "is", null);

  for (const outing of outings || []) {
    const start = new Date(outing.voting_start_at).getTime();
    const end = new Date(outing.voting_end_at).getTime();

    // voting not active yet
    if (nowTs < start) continue;

    // voting ended
    if (nowTs >= end) {
      await sendVotingEndedEmails(outing.id);
      continue;
    }

    // still active → send reminders
    await sendVotingReminderEmails(outing.id);
  }
}

// -----------------------------------------------------------
// Send 30-minute reminders to NOT-voted users
// -----------------------------------------------------------
async function sendVotingReminderEmails(outingId: number) {
  const { data: outing } = await db
    .from("outings")
    .select("title")
    .eq("id", outingId)
    .maybeSingle();

  if (!outing) return;

  const users = await getOutingUsers(outingId);

  for (const u of users) {
    const prefs = await getNotificationPrefs(String(u.user_id));
    if (!prefs.emailEnabled || !prefs.votingEnabled) continue;

    const hasVoted = await userHasVoted(outingId, u.user_id);
    if (hasVoted) continue;

    await sendNotificationEmail({
      to: u.email,
      subject: `Voting reminder for ${outing.title}`,
      text: `You haven't voted yet for "${outing.title}". Please vote soon!`
    });
  }
}

// -----------------------------------------------------------
// Send “voting ended” email
// -----------------------------------------------------------
export async function sendVotingEndedEmails(outingId: number) {
  const { data: outing } = await db
    .from("outings")
    .select("title")
    .eq("id", outingId)
    .maybeSingle();

  if (!outing) return;

  const users = await getOutingUsers(outingId);

  for (const u of users) {
    const prefs = await getNotificationPrefs(String(u.user_id));
    if (!prefs.emailEnabled || !prefs.votingEnabled) continue;

    await sendNotificationEmail({
      to: u.email,
      subject: `Voting ended for ${outing.title}`,
      text: `Voting has finished for "${outing.title}".`
    });
  }
}