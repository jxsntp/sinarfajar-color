import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { createStore, listStores } from "@/domains/stores/service";
export const GET = () =>
  endpoint("stores.list", async () => listStores(await currentStaff()));
export const POST = (req: Request) =>
  endpoint(
    "stores.create",
    async () => {
      requireOrigin(req);
      const scope = await currentStaff("admin");
      const { code, name } = z
        .object({
          code: z.string().regex(/^[A-Z0-9-]{1,20}$/),
          name: z.string().trim().min(1).max(100),
        })
        .strict()
        .parse(await req.json());
      return createStore(scope, code, name);
    },
    201,
  );
