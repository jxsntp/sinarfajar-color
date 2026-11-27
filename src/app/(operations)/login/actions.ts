"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authClient,
  staffCookie,
  staffScope,
} from "@/domains/authentication/staff";
import { navigation, destinations } from "@/domains/authentication/access";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { clientBucket, consumeQuota } from "@/lib/security";

export async function signIn(form: FormData) {
  const parsed = z
    .object({
      email: z.email(),
      password: z.string().min(1).max(512),
      organization: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .max(80),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect("/login?error=1");
  const { email, password, organization } = parsed.data;
  try {
    await consumeQuota("login:network",clientBucket(await headers()),60,60);
    await consumeQuota("login:account",organization + ":" + email.toLowerCase(),8,900);
  } catch { redirect("/login?error=1"); }
  const { data, error } = await authClient().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) redirect("/login?error=1");
  const token = data.session.access_token;
  const scope = await staffScope(token, organization).catch((error) => {
    if (error instanceof HttpError) redirect("/login?error=1");
    throw error;
  });
  const jar = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().APP_ENV !== "development",
    path: "/",
    maxAge: data.session.expires_in,
  };
  jar.set(staffCookie, token, options);
  jar.set("inaura_org", organization, options);
  redirect(destinations[navigation(scope.role)[0]]);
}
export async function signOut() {
  const jar = await cookies();
  jar.delete(staffCookie);
  jar.delete("inaura_org");
  redirect("/login");
}
