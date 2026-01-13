import { supabase as db } from "../lib/supabase";

export type UserNotificationPrefs = {
  emailEnabled: boolean;
  outingEnabled: boolean;
  votingEnabled: boolean;
};

export async function getNotificationPrefs(
  userId: string
): Promise<UserNotificationPrefs> {
  const { data, error } = await db
    .from("user_notification_settings")
    .select("email_enabled, outing_reminders_enabled, voting_reminders_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getNotificationPrefs error:", error.message);
  }

  return {
    emailEnabled: data?.email_enabled ?? true,
    outingEnabled: data?.outing_reminders_enabled ?? true,
    votingEnabled: data?.voting_reminders_enabled ?? true,
  };
}
