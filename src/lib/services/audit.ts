import { repo, uid, nowIso } from "../db/idb";
import type { AuditLog } from "../db/types";

export function logAudit(action: string, entity: string, entityId: string, summary: string) {
  return repo<AuditLog>("auditLogs").put({ id: uid(), at: nowIso(), action, entity, entityId, summary }).catch(() => {});
}
