import type { DeviceKind } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { issue, digest } from "@/lib/credentials";
import { HttpError } from "@/lib/http";
import { allow, type StaffScope } from "../authentication/access";
export async function registerDevice(
  scope: StaffScope,
  storeId: string,
  label: string,
  kind: DeviceKind,
) {
  allow(scope, "admin");
  const store = await db.store.findFirst({
    where: { id: storeId, organizationId: scope.organizationId },
  });
  if (!store) throw new HttpError(404, "unknown_store");
  const prefix = kind === "KIOSK" ? "device" : "pos";
  const credential = issue(prefix);
  const device = await db.device.create({
    data: {
      organizationId: scope.organizationId,
      storeId,
      kind,
      label,
      expiresAt: new Date(Date.now() + env().DEVICE_TTL_DAYS * 86400000),
      keyHash: digest(credential, prefix),
    },
    select: { id: true, expiresAt: true },
  });
  return { deviceId: device.id, expiresAt: device.expiresAt, credential };
}
export async function revokeDevice(scope: StaffScope, id: string) {
  allow(scope, "admin");
  const result = await db.device.updateMany({
    where: { id, organizationId: scope.organizationId },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new HttpError(404, "unknown_device");
  return { revoked: true };
}
