import Link from "next/link";
import { cookies, headers } from "next/headers";
import { currentStation, localCameraTrial } from "@/domains/color-analysis/stations";
import { activeKiosk } from "@/domains/devices/service";
import { env } from "@/lib/env";
import type { CSSProperties } from "react";
import { brandFor, messages } from "@/domains/organizations/branding";
import { Studio } from "./studio";
export const dynamic = "force-dynamic";
export default async function Kiosk() {
  const brand = await brandFor();
  const t = messages(brand.locale);
  const environment = env().APP_ENV;
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  // Only look up the device where a trial can run.
  const device = localCameraTrial(host, environment) ? await activeKiosk(cookieStore.get("inaura_device")?.value) : null;
  const trialStation = localCameraTrial(host, environment, currentStation(device?.id));
  return (
    <main
      className="shell"
      lang={brand.locale}
      style={{ "--accent": brand.accent } as CSSProperties}
    >
      <header className="mast">
        <span className="wordmark">{brand.name}</span>
        {/* Enrolled kiosks hide staff sign-in from customers; staff can still open /login directly. */}
        {!cookieStore.has("inaura_device") && <Link href="/login">{t.staff}</Link>}
      </header>
      <Studio t={t} locale={brand.locale} enrolled={cookieStore.has("inaura_device")}
        trialStation={trialStation} showTestReportLink={environment === "development"} />
    </main>
  );
}
