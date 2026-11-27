import { currentStaff } from "@/domains/authentication/staff";
import { importCatalog, importInput } from "@/domains/catalog/csv";
import { endpoint, requireOrigin } from "@/lib/http";
export const POST = (req: Request) =>
  endpoint("catalog.import", async () => {
    requireOrigin(req);
    const scope = await currentStaff("admin");
    return importCatalog(scope, importInput.parse(await req.json()));
  });
