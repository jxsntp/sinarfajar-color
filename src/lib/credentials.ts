import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./http";
type Kind = "device" | "kiosk" | "report" | "pos" | "checkout";
export const issue = (kind: Kind) =>
  kind + "_" + randomBytes(32).toString("base64url");
export function digest(value: string, kind: Kind) {
  if (
    !value.startsWith(kind + "_") ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.slice(kind.length + 1))
  )
    throw new HttpError(401, "invalid_credential");
  return createHash("sha256").update(value).digest("hex");
}
