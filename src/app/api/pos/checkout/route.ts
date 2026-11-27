import { z } from "zod";
import { bearer, endpoint } from "@/lib/http";
import { resolveCheckout } from "@/domains/inquiries/customer";
export const POST = (req: Request) =>
  endpoint("pos.checkout", async () =>
    resolveCheckout(
      bearer(req),
      z
        .object({ code: z.string().max(64) })
        .strict()
        .parse(await req.json()).code,
    ),
  );
