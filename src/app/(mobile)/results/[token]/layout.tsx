import type { CSSProperties } from "react";
import { mobileSession } from "@/domains/sessions/report";
import { brandFor } from "@/domains/organizations/branding";
export const dynamic = "force-dynamic";
export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ token: string }>;
  children: React.ReactNode;
}) {
  const session = await mobileSession((await params).token);
  const brand = await brandFor(session.organizationId);
  return (
    <main
      className="shell mobile-shell"
      lang={brand.locale}
      style={{ "--accent": brand.accent } as CSSProperties}
    >
      <header className="mast">
        <span className="wordmark">{brand.name}</span>
      </header>
      <section className="panel narrow">{children}</section>
    </main>
  );
}
