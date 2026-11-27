import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { allow, type Area, type StaffScope } from "./access";

export const staffCookie = "inaura_staff";
export function authClient() {
  const config = env();
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function staffScope(
  token: string | undefined,
  slug: string,
): Promise<StaffScope> {
  if (!token) throw new HttpError(401, "sign_in_required");
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "invalid_staff_session");
  const organization = await db.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!organization) throw new HttpError(403, "permission_denied");
  const userId = data.user.id;
  const organizationId = organization.id;
  const profile = await db.userProfile.findUnique({
    where: { id: userId },
    select: { platformAdmin: true },
  });
  if (profile?.platformAdmin)
    return { userId, organizationId, role: "PLATFORM_ADMIN", storeId: null };
  const membership = await db.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership) throw new HttpError(403, "permission_denied");
  return {
    userId,
    organizationId,
    role: membership.role,
    storeId: membership.storeId,
  };
}
export async function currentStaff(area?: Area) {
  const jar = await cookies();
  const token = jar.get(staffCookie)?.value;
  if (!token) throw new HttpError(401, "sign_in_required");
  const scope = await staffScope(
    token,
    jar.get("inaura_org")?.value ?? env().CLIENT_SLUG,
  );
  if (area) allow(scope, area);
  return scope;
}
