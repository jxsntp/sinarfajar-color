import { z } from "zod";
import { endpoint, requireOrigin } from "@/lib/http";
import { currentStaff } from "@/domains/authentication/staff";
import { operationStore } from "@/domains/operations/store";
import { operationalReport } from "@/domains/operations/report";
import { importTransactions } from "@/domains/transactions/import";
export const POST = (req: Request) =>
  endpoint("pos.reconcile", async () => {
    requireOrigin(req);
    const staff = await currentStaff("staff");
    const data = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("report"),
          storeId: z.uuid(),
          expected: z
            .array(
              z
                .string()
                .trim()
                .min(1)
                .max(100)
                .refine((value) => !/report_|checkout_/.test(value)),
            )
            .max(500)
            .default([]),
        }),
        z.object({
          type: z.literal("csv"),
          storeId: z.uuid(),
          csv: z.string().min(1).max(350000),
          commit: z.boolean(),
        }),
      ])
      .parse(await req.json());
    const scope = await operationStore(staff, data.storeId, true);
    return data.type === "report"
      ? operationalReport(scope, [...new Set(data.expected)])
      : importTransactions(scope, data.csv, data.commit);
  });
