import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { mobileSession } from "@/domains/sessions/report";
import { brandFor, messages } from "@/domains/organizations/branding";
import { experience, isTone } from "@/domains/sessions/palette";
import { Gold, NamedPalette, Swatches } from "@/components/palette";
import { readPalette, readTrial } from "@/domains/color-analysis/result";
import { toneLabels, tones } from "@/domains/color-analysis/swatches";
import { ReportOpen } from "./report-open";
import { PrivacyControls } from "./privacy-controls";
import { ReportTools } from "./report-tools";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function Report({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const scope = await mobileSession(token);
  const [brand, analysis] = await Promise.all([
    brandFor(scope.organizationId),
    db.colorAnalysis.findUniqueOrThrow({
      where: {
        organizationId_sessionId: {
          organizationId: scope.organizationId,
          sessionId: scope.id,
        },
      },
    }),
  ]);
  const t = messages(brand.locale);
  const copy = experience(brand.locale);
  const tone = isTone(analysis.profile) ? analysis.profile : "uncertain";
  const swatches = readPalette(analysis.paletteSnapshot);
  const trial = readTrial(analysis.paletteSnapshot);
  if (trial && env().APP_ENV !== "development") notFound();
  const lang = brand.locale === "en-US" ? "en" : "id";
  const groups = tones.filter((group) => analysis.toneGroups.includes(group));
  const heading = trial ? copy.trialPalette : groups.length
    ? (analysis.uncertain ? copy.mixed : analysis.source === "AUTOMATIC" ? copy.automatic : copy.own)
      + " · " + groups.map((group) => toneLabels[group][lang]).join(" / ")
    : tone === "uncertain" ? t.uncertain : copy.own + " · " + t[tone];
  return (
    <div className="mobile-report">
      <h1>{t.result}</h1>
      <h2>{heading}</h2>
      {swatches.length ? <NamedPalette swatches={swatches} locale={brand.locale} />
        : <Swatches tone={tone} colors={analysis.palette} locale={brand.locale} />}
      <p>{trial ? copy.trialExplanation : tone === "uncertain" && !groups.length && !analysis.paletteVersion ? copy.unsure : copy.guidance}</p>
      <Gold locale={brand.locale} suggested={trial?.gold} />
      <Link
        className="action mobile-action"
        prefetch={false}
        href={"/results/" + token + "/discover"}
      >
        {copy.discover}
      </Link>
      <p className="privacy-note">{copy.private}</p>
      <ReportTools
        token={token}
        locale={brand.locale}
        tone={tone}
        colors={analysis.palette}
        paletteLabel={swatches.length ? heading : undefined}
        swatchNames={swatches.length ? swatches.map((swatch) => swatch.label[lang]) : undefined}
        brand={brand.name}
        social={env().PUBLIC_SOCIAL_URL}
      />
      <PrivacyControls token={token} locale={brand.locale} />
      <ReportOpen token={token} />
    </div>
  );
}
