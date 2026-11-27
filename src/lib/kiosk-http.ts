import { cookies } from "next/headers";
import { bearer, requireOrigin, HttpError } from "./http";
export async function deviceKey(req: Request) {
  requireOrigin(req);
  if (req.headers.has("authorization")) return bearer(req);
  const token = (await cookies()).get("inaura_device")?.value;
  if (!token) throw new HttpError(401, "device_required");
  return token;
}
