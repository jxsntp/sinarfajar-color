import Link from "next/link";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { CSSProperties } from "react";
import { brandFor, messages } from "@/domains/organizations/branding";
import { Studio } from "./studio";
export const dynamic = "force-dynamic";
export default async function Kiosk() {
  const brand = await brandFor();
  const t = messages(brand.locale);
  const environment = env().APP_ENV;
  return (
    <main
      className="shell"
      lang={brand.locale}
      style={{ "--accent": brand.accent } as CSSProperties}
    >
      <header className="mast">
        <span className="wordmark">{brand.name}</span>
        <Link href="/login">{t.staff}</Link>
      </header>
      <Studio t={t} locale={brand.locale} enrolled={(await cookies()).has("inaura_device")}
        showTestReportLink={environment === "development"} />
    </main>
  );
}
