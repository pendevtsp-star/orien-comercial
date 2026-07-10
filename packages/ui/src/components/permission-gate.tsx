import type { ReactNode } from "react";

export function PermissionGate({
  granted,
  required,
  children,
  fallback = null
}: {
  granted: readonly string[];
  required: readonly string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = required.every((permission) => granted.includes(permission));
  return allowed ? <>{children}</> : <>{fallback}</>;
}
