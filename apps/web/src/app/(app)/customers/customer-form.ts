export function buildCustomerPayload(form: FormData, editing: boolean) {
  const payload: Record<string, unknown> = {
    name: form.get("name"),
    document: form.get("document") || undefined,
    email: form.get("email") || undefined,
    whatsapp: form.get("whatsapp") || undefined,
  };
  if (!editing) {
    payload.type = "individual";
    payload.tags = [];
    payload.communicationOptIn = false;
    payload.isActive = true;
  }
  return payload;
}
