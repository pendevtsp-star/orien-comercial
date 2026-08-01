import { describe, expect, it } from "vitest";
import { groupFields } from "./resource-page-model";

describe("groupFields", () => {
  it("keeps following fields in the most recently declared section", () => {
    expect(
      groupFields([
        { name: "name", label: "Nome", section: "Comercial" },
        { name: "sku", label: "SKU" },
        { name: "ncm", label: "NCM", section: "Tributação" },
        { name: "cest", label: "CEST" },
        { name: "cfop", label: "CFOP" },
      ]).map((group) => ({
        section: group.section,
        fields: group.fields.map((field) => field.name),
      })),
    ).toEqual([
      { section: "Comercial", fields: ["name", "sku"] },
      { section: "Tributação", fields: ["ncm", "cest", "cfop"] },
    ]);
  });

  it("groups leading fields without duplicating React keys", () => {
    const groups = groupFields([
      { name: "name", label: "Nome" },
      { name: "sku", label: "SKU" },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.fields).toHaveLength(2);
  });
});
