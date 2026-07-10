export type ToastKind = "success" | "error" | "info";

export function toast(message: string, kind: ToastKind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sgc:toast", { detail: { message, kind } }));
}
