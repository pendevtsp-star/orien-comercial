export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3334/api/v1";
const TENANT_KEY = "sgc.currentTenantId";
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getTenantId() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(TENANT_KEY) ?? undefined;
}

export function setTenantId(tenantId: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(TENANT_KEY, tenantId);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, true);
}

async function request<T>(path: string, init: RequestInit, allowRefresh: boolean): Promise<T> {
  const tenantId = getTenantId();
  const headers = new Headers(init.headers);
  const requestId = createRequestId();
  headers.set("Content-Type", "application/json");
  headers.set("x-request-id", requestId);
  if (tenantId) headers.set("x-tenant-id", tenantId);

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (response.status === 401 && allowRefresh && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; requestId?: string; statusCode?: number } | null;
    const error = new ApiError(
      payload?.message ?? "Falha ao comunicar com a API.",
      payload?.statusCode ?? response.status,
      payload?.requestId ?? response.headers.get("x-request-id") ?? requestId
    );
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sgc:session-expired"));
    }
    throw error;
  }

  return response.json() as Promise<T>;
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-request-id": createRequestId() },
      body: "{}"
    }).then((response) => response.ok).catch(() => false).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function openApiDocument(path: string, allowRefresh = true): Promise<void> {
  const tenantId = getTenantId();
  const headers = new Headers();
  const requestId = createRequestId();
  headers.set("x-request-id", requestId);
  if (tenantId) headers.set("x-tenant-id", tenantId);

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers
  });

  if (response.status === 401 && allowRefresh && await refreshSession()) {
    return openApiDocument(path, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string; requestId?: string; statusCode?: number } | null;
    throw new ApiError(
      payload?.message ?? "Falha ao abrir documento.",
      payload?.statusCode ?? response.status,
      payload?.requestId ?? response.headers.get("x-request-id") ?? requestId
    );
  }

  const html = await response.text();
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Nao foi possivel abrir a janela do documento.");
  }

  popup.document.open();
  popup.document.write(html);
  popup.document.close();
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}`;
}
