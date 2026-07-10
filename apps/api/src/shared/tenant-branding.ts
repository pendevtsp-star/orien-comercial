import { defaultTenantBranding, resolveBranding, type TenantBranding } from "@sgc/documents";
import type { DatabaseService } from "../modules/database/database.service";

export async function loadTenantBranding(database: DatabaseService, tenantId: string): Promise<TenantBranding> {
  const result = await database.tenantQuery<{ value: Partial<TenantBranding> | null; tenant_name: string }>(
    tenantId,
    `
    SELECT ts.value, t.name AS tenant_name
    FROM tenants t
    LEFT JOIN tenant_settings ts
      ON ts.tenant_id = t.id
     AND ts.key = 'branding'
    WHERE t.id = $1
    LIMIT 1
    `,
    [tenantId]
  );

  const row = result.rows[0];
  return resolveBranding({
    ...defaultTenantBranding,
    companyName: row?.tenant_name ?? defaultTenantBranding.companyName,
    ...(row?.value ?? {})
  });
}
