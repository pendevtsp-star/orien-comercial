export function buildCustomerPayload(form: FormData, editing: boolean) {
  const payload: Record<string, unknown> = {
    name: form.get("name"),
    document: optionalCustomerValue(form, "document", editing),
    email: optionalCustomerValue(form, "email", editing),
    whatsapp: optionalCustomerValue(form, "whatsapp", editing),
  };
  if (!editing) {
    payload.type = "individual";
    payload.tags = [];
    payload.communicationOptIn = false;
    payload.isActive = true;
  }
  return payload;
}

function optionalCustomerValue(form: FormData, name: string, editing: boolean) {
  const value = form.get(name);
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || (editing ? null : undefined);
}
