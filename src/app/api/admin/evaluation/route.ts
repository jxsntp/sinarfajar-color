import { currentStaff } from "@/domains/authentication/staff";
import {
  evaluationHistory,
  labCommand,
  labOperation,
} from "@/domains/recommendations/evaluation";
import { endpoint, requireOrigin } from "@/lib/http";
export const GET = () =>
  endpoint("lab.history", async () =>
    evaluationHistory(await currentStaff("lab")),
  );
export const POST = (req: Request) =>
  endpoint("lab.comparison", async () => {
    requireOrigin(req);
    return labOperation(
      await currentStaff("lab"),
      labCommand.parse(await req.json()),
    );
  });
