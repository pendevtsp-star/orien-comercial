import { useEffect, useState } from "react";
import { apiFetch, getTenantId } from "./api";

type MePayload = {
  memberships: Array<{ tenantId: string; permissions: string[] }>;
};

export function permissionsForTenant(payload: MePayload, tenantId?: string) {
  if (!tenantId) return [];
  return payload.memberships.find((membership) => membership.tenantId === tenantId)?.permissions ?? [];
}

export function useCurrentPermissions() {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<MePayload>("/me")
      .then((payload) => {
        if (active) setPermissions(permissionsForTenant(payload, getTenantId()));
      })
      .catch(() => {
        if (active) setPermissions([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { permissions, loading };
}
