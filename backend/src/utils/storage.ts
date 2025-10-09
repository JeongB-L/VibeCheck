import { supabase as sb } from "../lib/supabase";

function extFromMime(m: string) {
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadAvatarToStorage(
  userId: string,
  file: Express.Multer.File
) {
  const ext = extFromMime(file.mimetype);
  const path = `avatars/${userId}/avatar_${Date.now()}.${ext}`;
  const { error } = await sb.storage
    .from("avatars")
    .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
  if (error) throw error;
  return path;
}

export function publicUrlFromPath(path: string | null | undefined) {
  if (!path) return null;
  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
}
