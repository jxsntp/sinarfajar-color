import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { readTrial } from "@/domains/color-analysis/result";
import { isRegistered } from "@/domains/sessions/registration";
import { photoUrl } from "@/domains/catalog/photo";
import { mobileSession } from "@/domains/sessions/report";
import { brandFor } from "@/domains/organizations/branding";
import { mobileText } from "@/domains/sessions/mobile-copy";
import { db } from "@/lib/db";
import { readResult } from "@/domains/recommendations/discovery";
import { DiscoveryForm } from "./discovery-form";
import { availablePalette, storedPalette } from "@/domains/recommendations/palette-evidence";
import { colorStyles, paletteSnapshot, paletteVersion } from "@/domains/color-analysis/swatches";
export default async function Discover({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await mobileSession(token);
  const [brand, run, analysis] = await Promise.all([
    brandFor(session.organizationId),
    db.recommendationRun.findFirst({
      where: {
        organizationId: session.organizationId,
        sessionId: session.id,
        status: "COMPLETE",
      },
      orderBy: { createdAt: "desc" },
    }),
    db.colorAnalysis.findUnique({
      where: { organizationId_sessionId: { organizationId: session.organizationId, sessionId: session.id } },
      select: { paletteVersion: true, paletteSnapshot: true, colorStyle: true },
    }),
  ]);
  const trial = readTrial(analysis?.paletteSnapshot);
  if (trial && env().APP_ENV !== "development") notFound();
  const trialRegistered = trial ? await isRegistered(session) : undefined;
  const version = analysis?.paletteVersion ?? paletteVersion;
  const style = colorStyles.find((item) => item === analysis?.colorStyle);
  const shades = paletteSnapshot(availablePalette(version, style));
  const text = mobileText(brand.locale);
  const canReuse = !trial || (trialRegistered && storedPalette(run?.colorContext)?.categoryCoverage);
  return (
    <>
      <Link prefetch={false} className="text-button" href={"/results/" + token}>
        {text.report}
      </Link>
      <h1>{trialRegistered === false ? text.register : text.title}</h1>
      <p>{trial ? (trialRegistered ? "" : text.registerHint) : text.hint}</p>
      <DiscoveryForm
        token={token}
        locale={brand.locale}
        photoBase={photoUrl("")}
        shades={shades}
        swatchVersion={shades.length ? version : null}
        trialRegistered={trialRegistered}
        initial={run && canReuse ? await readResult(token, run.id) : null}
      />
    </>
  );
}
