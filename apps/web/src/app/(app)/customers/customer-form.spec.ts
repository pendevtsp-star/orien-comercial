import { describe, expect, it } from "vitest";
import { buildCustomerPayload } from "./customer-form";

describe("customer form payload", () => {
  it("does not send creation defaults when editing an existing customer", () => {
    const form = new FormData();
    form.set("name", "Cliente atualizado");
    form.set("document", "");
    form.set("email", "cliente@example.com");
    form.set("whatsapp", "");

    expect(buildCustomerPayload(form, true)).toEqual({
      name: "Cliente atualizado",
      document: undefined,
      email: "cliente@example.com",
      whatsapp: undefined,
    });
  });
});
