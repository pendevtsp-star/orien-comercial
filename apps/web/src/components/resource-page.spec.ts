import { describe, expect, it, vi } from "vitest";
import { clearFileInput, prepareResourcePayload } from "./resource-page-form";
import { groupFields } from "./resource-page-model";

class FailingFileReader {
  onerror: ((error: Error) => void) | null = null;

  readAsDataURL() {
    this.onerror?.(new Error("read failed"));
  }
}

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

describe("resource form payload", () => {
  it("surfaces image read failures so submission can leave the saving state", async () => {
    vi.stubGlobal("FileReader", FailingFileReader);
    const form = new FormData();
    form.set("name", "Produto teste");
    form.set("imageFile", new File(["image"], "produto.png", { type: "image/png" }));

    await expect(prepareResourcePayload(form)).rejects.toThrow("read failed");

    vi.unstubAllGlobals();
  });

  it("clears the selected file input together with its preview", () => {
    const input = { value: "produto.png" } as HTMLInputElement;

    clearFileInput(input);

    expect(input.value).toBe("");
  });
});
