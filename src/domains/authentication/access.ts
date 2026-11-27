import type { StaffRole } from "@prisma/client";
import { HttpError } from "@/lib/http";

export const destinations = {
  staff: "/staff",
  dashboard: "/dashboard",
  admin: "/admin",
  lab: "/admin/ai-lab",
} as const;
export type Area = keyof typeof destinations;
export type Role = StaffRole | "PLATFORM_ADMIN";
export type StaffScope = {
  userId: string;
  organizationId: string;
  storeId: string | null;
  role: Role;
};
const matrix: Record<Role, readonly Area[]> = {
  PLATFORM_ADMIN: ["staff", "dashboard", "admin", "lab"],
  ORG_ADMIN: ["staff", "dashboard", "admin", "lab"],
  STORE_MANAGER: ["staff", "dashboard"],
  SALES_ASSOCIATE: ["staff"],
  MARKETING_ANALYST: ["dashboard"],
};
export const navigation = (role: Role) => matrix[role];
export function allow(scope: StaffScope, area: Area) {
  if (!matrix[scope.role].includes(area))
    throw new HttpError(403, "permission_denied");
}
export function storeFilter(scope: StaffScope) {
  return {
    organizationId: scope.organizationId,
    ...(scope.storeId ? { storeId: scope.storeId } : {}),
  };
}
