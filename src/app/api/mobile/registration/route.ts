import { bearer, endpoint, requireOrigin } from "@/lib/http";
import { boundedJson, networkQuota } from "@/lib/security";
import { registrationInput, registerTrial } from "@/domains/sessions/registration";

export const POST = (req: Request) => endpoint("mobile.registration", async () => {
  requireOrigin(req);
  await networkQuota(req, "mobile-registration", 60);
  return registerTrial(bearer(req), registrationInput.parse(await boundedJson(req, 1024)));
});
