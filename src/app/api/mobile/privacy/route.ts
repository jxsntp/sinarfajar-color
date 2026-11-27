import { customerPrivacy, privacyInput } from "@/domains/privacy/service";
import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { boundedJson, networkQuota } from "@/lib/security";

export const POST = (req: Request) => endpoint("privacy.customer", async () => {
  requireOrigin(req);
  await networkQuota(req, "privacy", 60);
  return customerPrivacy(bearer(req), privacyInput.parse(await boundedJson(req, 1024)));
});
