import {
  has,
  hasClickWithImpression,
  type SessionFact,
} from "../analytics/metrics";
export type Protocol = {
  id: string;
  name: string;
  version: number;
  state: string;
  primaryOutcome: string | null;
  observationDays: number | null;
  minimumPerArm: number | null;
};
const z95 = 1.959963984540054;
export function wilson(
  successes: number,
  total: number,
): [number, number] | null {
  if (!total) return null;
  const p = successes / total,
    z2 = z95 ** 2;
  const center = (p + z2 / (2 * total)) / (1 + z2 / total);
  const radius =
    (z95 * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total ** 2))) /
    (1 + z2 / total);
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
function effect(b: number, bn: number, c: number, cn: number) {
  const base = bn ? b / bn : null,
    treatment = cn ? c / cn : null;
  const bi = wilson(b, bn),
    ci = wilson(c, cn);
  if (base === null || treatment === null || !bi || !ci)
    return { absolute: null, uplift: null, interval: null };
  const delta = treatment - base;
  return {
    absolute: delta,
    uplift: base ? delta / base : null,
    interval: [
      Math.max(-1, delta - Math.hypot(treatment - ci[0], bi[1] - base)),
      Math.min(1, delta + Math.hypot(ci[1] - treatment, base - bi[0])),
    ] as [number, number],
  };
}
export function compareExperiments(
  rows: SessionFact[],
  protocols: Protocol[],
  now: number,
  salesAvailable: boolean,
) {
  return protocols.map((plan) => {
    const kiosk = plan.name === "kiosk-reveal";
    const arms = kiosk ? ["palette-first", "metals-first"] : ["B", "C"];
    const assigned = rows.flatMap((s) => {
      const assignment = s.assignments.find((a) => a.experimentId === plan.id);
      if (!assignment) return [];
      const end = assignment.at + (plan.observationDays ?? 7) * 86400000;
      const map =
        assignment.variant === "rules"
          ? "B"
          : assignment.variant === "openrouter"
            ? "C"
            : assignment.variant;
      const observed = {
        ...s,
        events: s.events.filter((e) => e.at >= assignment.at && e.at <= end),
        sales: s.sales.filter(
          (sale) => sale.at >= assignment.at && sale.at <= end,
        ),
      };
      return [{ map, mature: end <= now, observed }];
    });
    const groups = arms.map((arm) => {
      const group = assigned.filter((a) => a.map === arm);
      const completed = group.filter((a) => a.mature).map((a) => a.observed);
      const fallback = completed.filter((s) =>
        s.events.some((e) => e.name === "recommendation_fallback"),
      );
      const actualRules = completed.filter((s) =>
        s.runs.some(
          (r) =>
            r.strategy === "rules" &&
            s.events.some(
              (e) => e.runId === r.id && e.name === "recommendation_generated",
            ),
        ),
      );
      const actualOpenRouter = completed.filter((s) =>
        s.runs.some(
          (r) =>
            r.strategy === "openrouter" &&
            s.events.some(
              (e) => e.runId === r.id && e.name === "recommendation_generated",
            ),
        ),
      );
      return {
        arm,
        assigned: group.length,
        mature: completed.length,
        fallback: fallback.length,
        actualRules: actualRules.length,
        actualOpenRouter: actualOpenRouter.length,
        rows: completed,
      };
    });
    const total = (g: (typeof groups)[number], key: string) => {
      const s = g.rows;
      switch (key) {
        case "handoff":
          return [s.filter((r) => has(r, "open")).length, s.length];
        case "completed_handoff":
          return [
            s.filter((r) => has(r, "complete") && has(r, "open")).length,
            s.filter((r) => has(r, "complete")).length,
          ];
        case "product_click":
          return [s.filter((r) => hasClickWithImpression(r)).length, s.length];
        case "product_ctr":
          return [
            s.filter((r) => hasClickWithImpression(r)).length,
            s.filter((r) => has(r, "impression")).length,
          ];
        case "inquiry":
          return [s.filter((r) => has(r, "inquiry")).length, s.length];
        case "try_on":
          return [s.filter((r) => has(r, "tryOn")).length, s.length];
        case "purchase":
          return salesAvailable
            ? [s.filter((r) => r.sales.some((x) => x.net > 0)).length, s.length]
            : [0, 0];
        default:
          return [0, 0];
      }
    };
    const outcomes = (
      kiosk
        ? ["handoff", "completed_handoff"]
        : ["product_click", "product_ctr", "inquiry", "try_on", "purchase"]
    ).map((key) => {
      const [b, bn] = total(groups[0], key),
        [c, cn] = total(groups[1], key);
      return {
        key,
        primary:
          key === (plan.primaryOutcome ?? (kiosk ? "handoff" : "inquiry")),
        diagnostic: ["completed_handoff", "product_ctr"].includes(key),
        baseline: { successes: b, total: bn, interval: wilson(b, bn) },
        treatment: { successes: c, total: cn, interval: wilson(c, cn) },
        ...effect(b, bn, c, cn),
      };
    });
    return {
      ...plan,
      groups: groups.map(
        ({
          arm,
          assigned,
          mature,
          fallback,
          actualRules,
          actualOpenRouter,
        }) => ({
          arm,
          assigned,
          mature,
          fallback,
          actualRules,
          actualOpenRouter,
        }),
      ),
      sampleReady:
        plan.minimumPerArm !== null &&
        groups.every((g) => g.mature >= plan.minimumPerArm!),
      outcomes,
    };
  });
}
