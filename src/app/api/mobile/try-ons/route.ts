import { z } from "zod";
import { bearer, endpoint } from "@/lib/http";
import {
  confirmCustomerTryOn,
  customerTryOns,
} from "@/domains/operations/workflow";
export const GET = (req: Request) =>
  endpoint("mobile.try_on_list", () => customerTryOns(bearer(req)));
export const POST = (req: Request) =>
  endpoint("mobile.try_on_confirm", async () =>
    confirmCustomerTryOn(
      bearer(req),
      z
        .object({ id: z.uuid() })
        .strict()
        .parse(await req.json()).id,
    ),
  );
