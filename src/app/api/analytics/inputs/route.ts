import { z } from "zod";
import { currentStaff } from "@/domains/authentication/staff";
import {
  financeReport,
  inputCommand,
  saveAnalyticsInput,
} from "@/domains/analytics/inputs";
import { endpoint, requireOrigin } from "@/lib/http";
export const GET = (req: Request) =>
  endpoint("analytics.financial", async () => {
    const staff = await currentStaff("staff");
    return financeReport(
      staff,
      z.uuid().parse(new URL(req.url).searchParams.get("storeId")),
    );
  });
export const POST = (req: Request) =>
  endpoint("analytics.approved_input", async () => {
    requireOrigin(req);
    const staff = await currentStaff("staff");
    return saveAnalyticsInput(staff, inputCommand.parse(await req.json()));
  });
