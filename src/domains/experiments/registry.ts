import { db } from "@/lib/db";
export function experimentCount(organizationId: string) {
  return db.experiment.count({ where: { organizationId } });
}
