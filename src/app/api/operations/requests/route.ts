import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { operationStore } from "@/domains/operations/store";
import { customerRequests } from "@/domains/inquiries/queue";
import { refreshWaitAlerts } from "@/domains/operations/alerts";
import {
  requestCommand,
  requestOperation,
} from "@/domains/operations/workflow";

export const GET = (req: Request) =>
  endpoint("staff.requests", async () => {
    const staff = await currentStaff("staff");
    const scope = await operationStore(
      staff,
      z.uuid().parse(new URL(req.url).searchParams.get("storeId")),
    );
    await refreshWaitAlerts(scope);
    return customerRequests(scope, staff.userId);
  });
export const POST = (req: Request) =>
  endpoint("staff.request_action", async () => {
    requireOrigin(req);
    const staff = await currentStaff("staff");
    return requestOperation(staff, requestCommand.parse(await req.json()));
  });
