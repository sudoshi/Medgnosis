import { sql } from '@medgnosis/db';

export interface WriteAuditLogInput {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await sql`
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address, user_agent)
    VALUES (
      ${input.userId ?? null}::UUID,
      ${input.action},
      ${input.resourceType},
      ${input.resourceId ?? null},
      ${input.details ? JSON.stringify(input.details) : null}::JSONB,
      ${input.ipAddress ?? null},
      ${input.userAgent ?? null}
    )
  `;
}

export function writeSystemAuditLog(
  action: string,
  resourceType: string,
  resourceId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  return writeAuditLog({
    action,
    resourceType,
    resourceId,
    details,
    userId: null,
    ipAddress: null,
    userAgent: 'medgnosis-worker',
  });
}
