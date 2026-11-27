import { currentStaff } from "@/domains/authentication/staff";
import {
  configureExperiment,
  experimentCommand,
} from "@/domains/experiments/configure";
import { endpoint, requireOrigin } from "@/lib/http";
export const POST = (req: Request) =>
  endpoint("experiments.configure", async () => {
    requireOrigin(req);
    return configureExperiment(
      await currentStaff("lab"),
      experimentCommand.parse(await req.json()),
    );
  });
