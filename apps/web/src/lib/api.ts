export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3334/api/v1";
const TENANT_KEY = "sgc.currentTenantId";
const BRANCH_SCOPE_KEY = "sgc.currentBranchScopeId";
let refreshPromise: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly requestId?: string,
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
    window.localStorage.removeItem(BRANCH_SCOPE_KEY);
  }
}

export function getBranchScopeId() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(BRANCH_SCOPE_KEY) ?? undefined;
}

export function setBranchScopeId(branchId?: string) {
  if (typeof window === "undefined") return;
  if (branchId) window.localStorage.setItem(BRANCH_SCOPE_KEY, branchId);
  else window.localStorage.removeItem(BRANCH_SCOPE_KEY);
  window.dispatchEvent(new CustomEvent("sgc:branch-scope-changed", { detail: { branchId } }));
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, true);
}

async function request<T>(path: string, init: RequestInit, allowRefresh: boolean): Promise<T> {
  const tenantId = getTenantId();
  const branchScopeId = getBranchScopeId();
  const headers = new Headers(init.headers);
  const requestId = createRequestId();
  const ignoreBranchScope = headers.get("x-orien-branch-scope") === "all";
  headers.delete("x-orien-branch-scope");
  headers.set("Content-Type", "application/json");
  headers.set("x-request-id", requestId);
  if (tenantId) headers.set("x-tenant-id", tenantId);
  if (branchScopeId && !ignoreBranchScope) headers.set("x-branch-id", branchScopeId);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à API. Verifique sua internet e tente novamente.",
      0,
      requestId,
    );
  }

  if (response.status === 401 && allowRefresh && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      requestId?: string;
      statusCode?: number;
    } | null;
    const error = new ApiError(
      payload?.message ?? "Falha ao comunicar com a API.",
      payload?.statusCode ?? response.status,
      payload?.requestId ?? response.headers.get("x-request-id") ?? requestId,
    );
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sgc:session-expired"));
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!text.trim()) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      "A API retornou uma resposta invalida.",
      response.status,
      response.headers.get("x-request-id") ?? requestId,
    );
  }
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "x-request-id": createRequestId() },
      body: "{}",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function openApiDocument(
  path: string,
  print = false,
  allowRefresh = true,
): Promise<void> {
  const popup = window.open("", "_blank");
  if (!popup) {
    throw new Error("O navegador bloqueou a janela. Permita pop-ups para visualizar o documento.");
  }
  popup.opener = null;
  popup.document.write(
    '<!doctype html><html lang="pt-BR"><body style="font-family:Arial;padding:24px">Preparando documento...</body></html>',
  );

  try {
    await loadApiDocument(path, popup, print, allowRefresh);
  } catch (error) {
    popup.close();
    throw error;
  }
}

async function loadApiDocument(
  path: string,
  popup: Window,
  print: boolean,
  allowRefresh: boolean,
): Promise<void> {
  const tenantId = getTenantId();
  const branchScopeId = getBranchScopeId();
  const headers = new Headers();
  const requestId = createRequestId();
  headers.set("x-request-id", requestId);
  if (tenantId) headers.set("x-tenant-id", tenantId);
  if (branchScopeId) headers.set("x-branch-id", branchScopeId);

  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers,
  });

  if (response.status === 401 && allowRefresh && (await refreshSession())) {
    return loadApiDocument(path, popup, print, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      requestId?: string;
      statusCode?: number;
    } | null;
    throw new ApiError(
      payload?.message ?? "Falha ao abrir documento.",
      payload?.statusCode ?? response.status,
      payload?.requestId ?? response.headers.get("x-request-id") ?? requestId,
    );
  }

  const html = await response.text();
  popup.document.open();
  const apiOrigin = new URL(API_URL).origin;
  popup.document.write(html.replace("<head>", `<head><base href="${apiOrigin}/" />`));
  popup.document.close();
  if (print) window.setTimeout(() => popup.print(), 350);
}

export async function downloadApiFile(
  path: string,
  filename: string,
  allowRefresh = true,
): Promise<void> {
  await loadApiFile(path, filename, allowRefresh);
}

async function loadApiFile(path: string, filename: string, allowRefresh: boolean): Promise<void> {
  const tenantId = getTenantId();
  const branchScopeId = getBranchScopeId();
  const headers = new Headers();
  const requestId = createRequestId();
  headers.set("x-request-id", requestId);
  if (tenantId) headers.set("x-tenant-id", tenantId);
  if (branchScopeId) headers.set("x-branch-id", branchScopeId);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { credentials: "include", headers });
  } catch {
    throw new ApiError(
      "Não foi possível conectar à API. Verifique a internet e tente novamente.",
      0,
      requestId,
    );
  }

  if (response.status === 401 && allowRefresh && (await refreshSession())) {
    return loadApiFile(path, filename, false);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      requestId?: string;
      statusCode?: number;
    } | null;
    throw new ApiError(
      payload?.message ?? "Falha ao baixar arquivo.",
      payload?.statusCode ?? response.status,
      payload?.requestId ?? response.headers.get("x-request-id") ?? requestId,
    );
  }

  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}`;
}
