import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
export const photoUploadLimit = 4 * 1024 * 1024;

export function photoType(bytes: Buffer) {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { ext: "png", mime: "image/png" };
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { ext: "jpg", mime: "image/jpeg" };
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return { ext: "webp", mime: "image/webp" };
  throw new HttpError(400, "unsupported_photo");
}
export async function uploadPhoto(organizationId: string, file: File) {
  if (!file.size || file.size > photoUploadLimit)
    throw new HttpError(400, "invalid_photo_size");
  const bytes = Buffer.from(await file.arrayBuffer());
  const { mime, ext } = photoType(bytes);
  const config = env();
  const key = config.SUPABASE_STORAGE_KEY ?? (config.APP_ENV === "development" && config.SUPABASE_URL === "http://127.0.0.1:25421" ? config.LOCAL_STORAGE_SERVICE_KEY : undefined);
  if (!key)
    throw new HttpError(503, "storage_unconfigured");
  const path = organizationId + "/" + randomUUID() + "." + ext;
  const client = createClient(
    config.SUPABASE_URL,
    key,
    { auth: { persistSession: false } },
  );
  const { error } = await client.storage
    .from("product-photos")
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new HttpError(502, "photo_upload_failed");
  return { path };
}
export const photoUrl = (path: string) =>
  env().SUPABASE_URL +
  "/storage/v1/object/public/product-photos/" +
  path.split("/").map(encodeURIComponent).join("/");
