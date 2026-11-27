import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentStaff } from "@/domains/authentication/staff";
import {
  destinations,
  navigation,
  type Area,
} from "@/domains/authentication/access";
import { HttpError } from "@/lib/http";
import { brandFor } from "@/domains/organizations/branding";
import { signOut } from "@/app/(operations)/login/actions";
const labels: Record<Area, string> = {
  staff: "Store operations",
  dashboard: "Dashboard",
  admin: "Administration",
  lab: "AI laboratory",
};
export async function pageStaff(area: Area) {
  try {
    return await currentStaff(area);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    if (error instanceof HttpError && error.status === 403) notFound();
    throw error;
  }
}
export async function Operations({
  area,
  children,
}: {
  area: Area;
  children: React.ReactNode;
}) {
  const scope = await pageStaff(area);
  const brand = await brandFor(scope.organizationId);
  return (
    <main className="shell">
      <header className="mast">
        <strong>{brand.name}</strong>
        <form action={signOut}>
          <button>Sign out</button>
        </form>
      </header>
      <nav aria-label="Staff workspace">
        {navigation(scope.role).map((a) => (
          <Link
            aria-current={a === area ? "page" : undefined}
            href={destinations[a]}
            key={a}
          >
            {labels[a]}
          </Link>
        ))}
      </nav>
      <section className="panel">
        <h1>{labels[area]}</h1>
        {children}
      </section>
    </main>
  );
}
