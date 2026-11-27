"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RankingSettings } from "@/domains/recommendations/settings";
export function LabControls({
  initial,
  approved,
  stores,
  prompts,
}: {
  initial: RankingSettings;
  approved: { models: string[]; providers: string[] };
  stores: { id: string; name: string }[];
  prompts: { id: string; name: string; version: number }[];
}) {
  const [settings, setSettings] = useState(initial);
  const [message, setMessage] = useState("");
  async function send(method: string, body: unknown) {
    try {
      const response = await fetch("/api/admin/ai-lab", {
        method,
        body: JSON.stringify(body),
      });
      const result = await response.json();
      setMessage(
        response.ok
          ? method === "PATCH"
            ? "Settings saved"
            : JSON.stringify(result.data, null, 2)
          : result.error.code,
      );
    } catch {
      setMessage("Request failed");
    }
  }
  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send("PATCH", settings);
        }}
      >
        <label>
          Assigned strategy
          <select
            value={settings.strategy}
            onChange={(e) =>
              setSettings({
                ...settings,
                strategy: e.target.value as RankingSettings["strategy"],
              })
            }
          >
            <option value="rules">Rules</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        {(["model", "provider"] as const).map((k) => (
          <label key={k}>
            {k}
            <select
              value={settings[k]}
              onChange={(e) =>
                setSettings({ ...settings, [k]: e.target.value })
              }
            >
              <option value="">Select approved {k}</option>
              {approved[k === "model" ? "models" : "providers"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <details>
          <summary>Preference weights</summary>
          {Object.entries(settings.weights).map(([k, v]) => (
            <label key={k}>
              {k}
              <input
                type="number"
                min="0"
                max="10"
                step=".1"
                value={v}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    weights: {
                      ...settings.weights,
                      [k]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </details>
        <label>
          Deployed prompt
          <select
            value={settings.promptId ?? ""}
            onChange={(e) =>
              setSettings({ ...settings, promptId: e.target.value || null })
            }
          >
            <option value="">Built-in prompt</option>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · v{p.version}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          {(
            [
              ["candidateLimit", "Maximum candidate SKUs", 5, 24, 1],
              ["outputTokens", "Output token limit", 128, 2000, 1],
              [
                "runLimitUsd",
                "Per-run cost ceiling (USD)",
                0.000001,
                1,
                0.000001,
              ],
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={settings[key] ?? ""}
                placeholder="Environment default"
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    [key]: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
          ))}
        </div>
        <Button type="submit">Save ranking settings</Button>
      </form>
      <h2>Evaluate a ranking</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            void send("POST", {
              storeId: f.get("store"),
              preferences: JSON.parse(String(f.get("prefs"))),
              response: f.get("response")
                ? JSON.parse(String(f.get("response")))
                : undefined,
            });
          } catch {
            setMessage("Enter valid JSON");
          }
        }}
      >
        <label>
          Store
          <select name="store">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Test preferences (JSON)
          <textarea name="prefs" defaultValue="{}" />
        </label>
        <label>
          Provider response to validate (optional JSON)
          <textarea name="response" />
        </label>
        <Button type="submit">Run local evaluation</Button>
      </form>
      <pre role="status">{message}</pre>
    </>
  );
}
