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

/**
 * Generates a public URL for a given path.
 */
export function publicUrlFromPath(
  path: string | null | undefined,
  bucket: string = "avatars"
) {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const { data } = sb.storage.from(bucket).getPublicUrl(path);
  // We append a timestamp to bust cache if needed, though for feed posts it's less critical than avatars
  return data.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
}
