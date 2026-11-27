import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";

export async function identity(db: PrismaClient, organizationId: string) {
  const email = "foundation-" + randomUUID() + "@example.test";
  const password = randomUUID() + "aA1!";
  const auth = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await auth.auth.signUp({ email, password });
  if (error || !data.session || !data.user)
    throw new Error(
      "Local Auth fixture signup failed: " + (error?.code ?? "missing session"),
    );
  const userId = data.user.id;
  await db.userProfile.create({
    data: {
      id: userId,
      memberships: { create: { organizationId, role: "ORG_ADMIN" } },
    },
  });
  return { email, password, userId, accessToken: data.session.access_token };
}
