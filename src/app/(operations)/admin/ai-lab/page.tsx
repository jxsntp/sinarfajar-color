import { pageStaff } from "@/components/operations";
import { experimentCount } from "@/domains/experiments/registry";
import { db } from "@/lib/db";
import { listStores } from "@/domains/stores/service";
import {
  approvedModels,
  settingsSchema,
} from "@/domains/recommendations/settings";
import { LabControls } from "./lab";
import { Research } from "./research";
import { evaluationHistory } from "@/domains/recommendations/evaluation";
export default async function Lab() {
  const scope = await pageStaff("lab");
  const [org, stores, runs, prompts, cases, experiments, history] =
    await Promise.all([
      db.organization.findUniqueOrThrow({
        where: { id: scope.organizationId },
      }),
      listStores(scope),
      db.recommendationRun.findMany({
        where: { organizationId: scope.organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.promptVersion.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, name: true, version: true, template: true },
        orderBy: [{ name: "asc" }, { version: "desc" }],
      }),
      db.evaluationCase.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true, name: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.experiment.findMany({
        where: {
          organizationId: scope.organizationId,
          state: { not: "LEGACY" },
        },
        orderBy: { createdAt: "desc" },
      }),
      evaluationHistory(scope),
    ]);
  return (
    <>
      <h2>AI laboratory</h2>
      <dl>
        <dt>Registered experiments</dt>
        <dd>{await experimentCount(scope.organizationId)}</dd>
      </dl>
      <LabControls
        initial={settingsSchema.parse(org.rankingSettings)}
        approved={approvedModels()}
        stores={stores}
        prompts={prompts}
      />
      <Research
        stores={stores}
        prompts={prompts}
        cases={cases}
        history={history}
        experiments={experiments}
        approved={approvedModels()}
      />
      <h2>Recent runs</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Model / strategy</th>
              <th>Result</th>
              <th>Latency</th>
              <th>USD</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.modelIdentifier ?? r.strategy}</td>
                <td>{r.failureCategory ?? r.status}</td>
                <td>{r.latencyMs} ms</td>
                <td>{r.inferenceCost?.toString() ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
