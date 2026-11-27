import { bearer, endpoint } from "@/lib/http";
import { resetSession } from "@/domains/sessions/service";
export const POST = (req: Request) =>
  endpoint("kiosk.reset", () => resetSession(bearer(req)));
