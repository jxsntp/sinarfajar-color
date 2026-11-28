import type { Prisma } from "@prisma/client";
import { HttpError } from "@/lib/http";
import type { SessionScope } from "../analytics/events";
import { cameraNotice, currentStation, localCameraTrial, stationFor, trialMethod } from "./stations";
import { env } from "@/lib/env";
import { manualMethod, paletteFor, paletteSnapshot, type ColorStyle, type Tone } from "./swatches";
import { toneInput, type ColorResultInput } from "./result";
import type { EngineCheck, MetalChoice } from "./draping";
import { palettes } from "../sessions/palette";

export async function resolveColorResult(
  tx: Prisma.TransactionClient,
  session: SessionScope,
  input: ColorResultInput,
  cameraConsentId?: string,
  host?: string | null,
  style: ColorStyle = "both",
  metal?: MetalChoice,
  check?: EngineCheck,
) {
  const station = stationFor(session.deviceId);
  const trialStation = localCameraTrial(host ?? null, env().APP_ENV, currentStation(session.deviceId));
  // A confirmation belongs to a camera trial; an overruled trial ends in a comparison result instead.
  if (check && (!trialStation || station.mode !== "manual" || (check === "overruled") === (input.kind === "trial")))
    throw new HttpError(400, "invalid_engine_check");
  // A trial suggests its own metal, so the comparison's metal step does not apply.
  if (metal && input.kind === "trial") throw new HttpError(400, "invalid_metal");
  const base = {
    profile: null, source: "MANUAL" as const, methodVersion: manualMethod, colorStyle: style,
    metal: metal ?? null, engineCheck: check ?? null,
  };
  if (input.kind === "uncertain") {
    const neutrals = station.paletteVersion ? paletteFor(station.paletteVersion, [], style) : [];
    return {
      ...base, quality: "uncertain", uncertain: true, uncertainty: input.reason,
      palette: neutrals.length ? neutrals.map(({ display }) => display) : palettes.uncertain.colors,
      paletteVersion: station.paletteVersion, paletteSnapshot: paletteSnapshot(neutrals),
    };
  }
  if (station.paletteVersion !== input.paletteVersion)
    throw new HttpError(400, "palette_revision_unavailable");
  let toneGroups: Tone[];
  if (input.kind === "trial" && (station.mode !== "manual" || !trialStation))
    throw new HttpError(403, "trial_unavailable");
  if (input.kind === "automatic" && (station.mode !== "automatic" || station.methodVersion !== input.methodVersion ||
      station.calibration?.revision !== input.calibrationVersion))
    throw new HttpError(403, "automatic_unavailable");
  if (input.kind === "automatic" || input.kind === "trial") {
    const consent = await tx.consent.findFirst({
      where: { organizationId: session.organizationId, sessionId: session.id, purpose: "local_camera" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!consent?.granted || consent.version !== cameraNotice || consent.id !== cameraConsentId)
      throw new HttpError(403, "camera_consent_required");
    const high = input.tones.filter((tone) => tone === "vivid" || tone === "dark").length;
    if (input.tones.length !== 2 || (input.quality === "mixed") !== (high === 1))
      throw new HttpError(400, "invalid_tone_selection");
  }
  if (input.kind === "manual") toneGroups = [toneInput.parse(input.paletteId.slice(6))];
  else toneGroups = input.tones;
  const swatches = paletteFor(input.paletteVersion, toneGroups, style);
  if (!swatches.length) throw new HttpError(400, "invalid_palette");
  if (input.kind === "trial") {
    const ranked = input.swatchIds.flatMap((id) => swatches.filter((swatch) => swatch.id === id && swatch.tone !== null));
    if (ranked.length !== 3) throw new HttpError(400, "invalid_palette");
    return {
      ...base, source: "AUTOMATIC" as const, methodVersion: trialMethod, calibrationVersion: trialStation?.calibration?.revision ?? null,
      toneGroups, paletteVersion: input.paletteVersion, quality: "experimental",
      uncertain: input.quality === "mixed",
      palette: ranked.map(({ display }) => display),
      paletteSnapshot: { kind: "camera-trial", swatches: paletteSnapshot(ranked), gold: input.gold },
    };
  }
  const mixed = input.kind === "mixed" || (input.kind === "automatic" && input.quality === "mixed");
  return {
    ...base, toneGroups, paletteVersion: input.paletteVersion,
    palette: swatches.map((swatch) => swatch.display), paletteSnapshot: paletteSnapshot(swatches),
    quality: input.kind === "automatic" ? input.quality : mixed ? "mixed" : "self-selected",
    uncertain: mixed, uncertainty: mixed ? "mixed_tones" : undefined,
    ...(input.kind === "automatic" ? {
      source: "AUTOMATIC" as const, methodVersion: input.methodVersion, calibrationVersion: input.calibrationVersion,
    } : {}),
  };
}
