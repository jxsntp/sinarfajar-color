"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { operationsRequest } from "@/lib/operations-client";
import type { evaluationHistory } from "@/domains/recommendations/evaluation";

const ratio = (num: number | null, den: number | null) =>
  num !== null && den
    ? num + " / " + den + " (" + ((100 * num) / den).toFixed(1) + "%)"
    : "Unavailable";
type Experiments = {
  id: string;
  name: string;
  version: number;
  state: string;
  primaryOutcome: string | null;
  minimumPerArm: number | null;
  observationDays: number | null;
  protocol: string | null;
}[];
type ResearchProps = {
  stores: { id: string; name: string }[];
  cases: { id: string; name: string }[];
  prompts: { id: string; name: string; version: number; template: string }[];
  history: Awaited<ReturnType<typeof evaluationHistory>>;
  experiments: Experiments;
  approved: { models: string[]; providers: string[] };
};
export function Research({
  stores,
  cases,
  prompts,
  history,
  experiments,
  approved,
}: ResearchProps) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [family, setFamily] = useState("kiosk-reveal");
  async function send(path: string, command: object) {
    setBusy(true);
    setStatus("");
    try {
      await operationsRequest(path, command);
      setStatus("Saved.");
      router.refresh();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message.replaceAll("_", " ")
          : "Request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function apply(
    event: FormEvent<HTMLFormElement>,
    action: "prompt" | "case" | "compare" | "experiment",
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const get = (key: string) => String(values.get(key) ?? "").trim();
    try {
      if (action === "prompt") {
        void send("/api/admin/evaluation", {
          action,
          name: get("name"),
          template: get("template"),
        });
        return;
      }
      if (action === "case") {
        const preferences = JSON.parse(get("preferences") || "{}");
        void send("/api/admin/evaluation", {
          action,
          name: get("name"),
          storeId: get("storeId"),
          preferences,
          color: get("color") || null,
          expectedSkus: get("skus")
            .split(/[\s,]+/)
            .filter(Boolean),
        });
        return;
      }
      if (action === "experiment") {
        void send("/api/admin/experiments", {
          action: "create",
          name: family,
          primaryOutcome: get("outcome"),
          minimumPerArm: Number(get("sample")),
          observationDays: Number(get("days")),
          protocol: get("protocol"),
        });
        return;
      }
      const variants = [1, 2]
        .filter((n) => get("model" + n))
        .map((n) => ({
          model: get("model" + n),
          provider: get("provider" + n),
          promptId: get("prompt" + n) || undefined,
        }));
      void send("/api/admin/evaluation", {
        action,
        caseId: get("caseId"),
        batchId: crypto.randomUUID(),
        variants,
      });
    } catch {
      setStatus("Use a valid JSON preferences object.");
    }
  }
  return (
    <section className="sales-tools">
      <h2>Evaluation datasets and prompt versions</h2>
      <details>
        <summary>Publish immutable prompt version</summary>
        <form onSubmit={(event) => apply(event, "prompt")}>
          <label>
            Prompt family
            <input name="name" pattern="[a-z0-9-]{3,60}" required />
          </label>
          <label>
            System prompt guidance
            <textarea
              name="template"
              minLength={12}
              maxLength={2000}
              required
            />
          </label>
          <Button type="submit" disabled={busy}>
            Publish prompt
          </Button>
        </form>
        <ul>
          {prompts.map((p) => (
            <li key={p.id}>
              <details>
                <summary>
                  {p.name} · v{p.version}
                </summary>
                <p>{p.template}</p>
              </details>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Save human-reviewed test case</summary>
        <form onSubmit={(event) => apply(event, "case")}>
          <label>
            Case name
            <input name="name" required />
          </label>
          <label>
            Store
            <select name="storeId" required>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Synthetic preferences (JSON)
            <textarea
              name="preferences"
              placeholder='{"category":"necklace"}'
            />
          </label>
          <label>
            Color profile
            <select name="color">
              <option value="">Unspecified</option>
              <option>warm</option>
              <option>cool</option>
              <option>neutral</option>
            </select>
          </label>
          <label>
            Reviewed relevant SKUs
            <textarea
              name="skus"
              placeholder="One SKU per line or comma-separated"
              required
            />
          </label>
          <Button type="submit" disabled={busy || !stores.length}>
            Save reviewed case
          </Button>
        </form>
      </details>
      <details>
        <summary>Compare rules and model variants</summary>
        <form onSubmit={(event) => apply(event, "compare")}>
          <label>
            Reviewed case
            <select name="caseId" required>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {[1, 2].map((n) => (
            <fieldset key={n}>
              <legend>Optional paid model {n}</legend>
              <div className="form-grid">
                <label>
                  Model {n}
                  <select name={"model" + n}>
                    <option value="">Skip</option>
                    {approved.models.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Provider {n}
                  <select name={"provider" + n}>
                    <option value="">Select approved provider</option>
                    {approved.providers.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Prompt {n}
                  <select name={"prompt" + n}>
                    <option value="">Active default</option>
                    {prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · v{p.version}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>
          ))}
          <Button type="submit" disabled={busy || !cases.length}>
            Run comparison
          </Button>
        </form>
      </details>
      <h3>Historical comparisons</h3>
      <LabTotals history={history} />
      {history.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case and batch</th>
                <th>Model / provider</th>
                <th>Prompt</th>
                <th>Served relevance</th>
                <th>Raw schema</th>
                <th>Invalid SKUs</th>
                <th>Latency</th>
                <th>Tokens in / out</th>
                <th>USD</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.batchId + r.label}>
                  <td>
                    {r.evaluationCase.name} · {r.batchId.slice(0, 8)}
                  </td>
                  <td>{r.model ? r.model + " / " + r.provider : r.label}</td>
                  <td>
                    {r.prompt
                      ? r.prompt.name + " v" + r.prompt.version
                      : "Built-in"}
                  </td>
                  <td>{ratio(r.relevantCount, r.outputCount)}</td>
                  <td>
                    {r.schemaValid === null
                      ? "Unavailable"
                      : r.schemaValid
                        ? "Valid"
                        : "Invalid"}
                  </td>
                  <td>{ratio(r.invalidSkus, r.returnedSkus)}</td>
                  <td>{r.durationMs === null ? "—" : r.durationMs + " ms"}</td>
                  <td>
                    {r.inputTokens ?? "—"} / {r.outputTokens ?? "—"}
                  </td>
                  <td>{r.costUsd ?? "Unavailable"}</td>
                  <td>
                    {r.status}
                    {r.fallback ? " · used fallback" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No comparisons recorded.</p>
      )}
      <h2>Experiment protocols</h2>
      <details>
        <summary>Configure an experiment</summary>
        <form
          className="form-grid"
          onSubmit={(event) => apply(event, "experiment")}
        >
          <label>
            Experiment
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="kiosk-reveal">Kiosk reveal and QR CTA</option>
              <option value="mobile-ranking">
                Mobile recommendation ranking
              </option>
            </select>
          </label>
          <label>
            Primary outcome
            <select name="outcome" key={family}>
              {family === "kiosk-reveal" ? (
                <option value="handoff">QR handoff</option>
              ) : (
                <>
                  <option value="inquiry">Product inquiry</option>
                  <option value="product_click">Product click</option>
                </>
              )}
            </select>
          </label>
          <label>
            Minimum matured sample per arm
            <input name="sample" type="number" min={10} max={100000} required />
          </label>
          <label>
            Observation window (days)
            <input name="days" type="number" min={1} max={30} required />
          </label>
          <label>
            Protocol reference and controls
            <textarea
              name="protocol"
              minLength={12}
              maxLength={800}
              required
              placeholder="Comparable staffing, placement and promotions"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Save experiment protocol
          </Button>
        </form>
      </details>
      {experiments.map((plan) => (
        <article className="ops-card" key={plan.id}>
          <div>
            <h3>
              {plan.name} · v{plan.version}
            </h3>
            <p>
              {plan.state} · {plan.primaryOutcome} · {plan.observationDays} days
              · {plan.minimumPerArm} per arm
            </p>
            <p>{plan.protocol}</p>
            <div className="controls">
              {(plan.state === "DRAFT" || plan.state === "PAUSED") && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send("/api/admin/experiments", {
                      id: plan.id,
                      action: "start",
                    })
                  }
                >
                  Start enrollment
                </Button>
              )}
              {plan.state === "RUNNING" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send("/api/admin/experiments", {
                      id: plan.id,
                      action: "pause",
                    })
                  }
                >
                  Pause enrollment
                </Button>
              )}
              {plan.state !== "STOPPED" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void send("/api/admin/experiments", {
                      id: plan.id,
                      action: "stop",
                    })
                  }
                >
                  Stop enrollment
                </Button>
              )}
            </div>
          </div>
        </article>
      ))}
      <p role="status">{status}</p>
    </section>
  );
}

function LabTotals({ history }: { history: ResearchProps["history"] }) {
  const groups = new Map<string, ResearchProps["history"]>();
  for (const entry of history) {
    if (!entry.model) continue;
    const prompt = entry.prompt
      ? entry.prompt.name + " v" + entry.prompt.version
      : "Built-in";
    const label = [entry.model, entry.provider, prompt].join(" · ");
    const group = groups.get(label) ?? [];
    group.push(entry);
    groups.set(label, group);
  }
  if (!groups.size) return null;
  return (
    <details>
      <summary>Model and prompt summaries (latest 100 comparison rows)</summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model / provider / prompt</th>
              <th>Raw schema validity</th>
              <th>Invalid SKU rate</th>
              <th>Fallback frequency</th>
              <th>p95 latency</th>
            </tr>
          </thead>
          <tbody>
            {[...groups].map(([label, attempts]) => {
              const known = attempts.filter(
                (attempt) => attempt.schemaValid !== null,
              );
              const raw = attempts.filter(
                (attempt) => attempt.returnedSkus !== null,
              );
              const durations = attempts
                .flatMap((attempt) =>
                  attempt.durationMs === null ? [] : [attempt.durationMs],
                )
                .sort((a, b) => a - b);
              const done = attempts.filter(
                (attempt) => attempt.status !== "pending",
              );
              return (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>
                    {ratio(
                      known.filter((a) => a.schemaValid).length,
                      known.length,
                    )}
                  </td>
                  <td>
                    {ratio(
                      raw.reduce((sum, a) => sum + (a.invalidSkus ?? 0), 0),
                      raw.reduce((sum, a) => sum + (a.returnedSkus ?? 0), 0),
                    )}
                  </td>
                  <td>
                    {ratio(done.filter((a) => a.fallback).length, done.length)}
                  </td>
                  <td>
                    {durations.length
                      ? durations[Math.ceil(durations.length * 0.95) - 1] +
                        " ms"
                      : "Unavailable"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
