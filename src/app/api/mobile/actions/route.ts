import { bearer, endpoint } from "@/lib/http";
import { boundedJson, networkQuota } from "@/lib/security";
import {
  customerAction,
  submitCustomerAction,
} from "@/domains/inquiries/customer";
export const POST = (req: Request) =>
  endpoint("mobile.action", async () => {
    await networkQuota(req, "mobile-action", 180);
    return submitCustomerAction(bearer(req), customerAction.parse(await boundedJson(req)));
  });
