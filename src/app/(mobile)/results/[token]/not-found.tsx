import { cookies } from "next/headers";
import { brandFor } from "@/domains/organizations/branding";
export default async function MissingReport() {
  // Reading a request API keeps this failure screen out of static build output.
  await cookies();
  const english = (await brandFor().catch(() => null))?.locale === "en-US";
  return (
    <main className="shell">
      <section className="panel narrow">
        <h1>{english ? "Report unavailable" : "Laporan tidak tersedia"}</h1>
        <p>
          {english
            ? "The link may have expired or been revoked. Start a new color session at the kiosk."
            : "Tautan mungkin sudah kedaluwarsa atau dicabut. Mulai sesi warna baru di kios."}
        </p>
      </section>
    </main>
  );
}
