import { Button } from "@/components/ui/button";
import { signIn } from "./actions";
import { env } from "@/lib/env";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const failed = (await searchParams).error;
  return (
    <main className="shell">
      <div className="mast">Inaura Retail Intelligence</div>
      <section className="panel narrow">
        <h1>Staff sign in</h1>
        <form action={signIn}>
          <label>
            Organization
            <input
              name="organization"
              defaultValue={env().CLIENT_SLUG}
              required
            />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {failed && (
            <p role="alert">Check your credentials and organization access.</p>
          )}
          <Button type="submit">Sign in</Button>
        </form>
      </section>
    </main>
  );
}
