import { describe, expect, it, vi } from "vitest";
import { ProductsService } from "./products.service";

const context = {
  tenantId: "tenant-a",
  userId: "user-a",
  membershipId: "membership-a",
  roleSlug: "owner",
  branchId: null,
  permissions: [],
};

describe("ProductsService create", () => {
  it("rolls back the product and removes the uploaded file when image persistence fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: "product-a", sku: "ORI-000001" }] })
      .mockRejectedValueOnce(new Error("media persistence failed"));
    const tenantTransaction = vi.fn(
      (_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) =>
        run({ query }),
    );
    const database = {
      tenantTransaction,
      tenantQuery: vi.fn(),
    };
    const service = new ProductsService(database as never, {} as never);
    const privateService = service as unknown as {
      persistUpload: (tenantId: string, dataUrl: string) => Promise<{ objectKey: string; filePath: string }>;
      removeUploadedFile: (filePath: string) => Promise<void>;
    };
    const persistUpload = vi.spyOn(privateService, "persistUpload").mockResolvedValue({
      objectKey: "/uploads/products/tenant-a/product.png",
      filePath: "C:/uploads/product.png",
    });
    const removeUploadedFile = vi.spyOn(privateService, "removeUploadedFile").mockResolvedValue(undefined);

    await expect(
      service.create(context, {
        name: "Produto teste",
        unit: "un",
        costPrice: 10,
        salePrice: 20,
        minStock: 0,
        isActive: true,
        sku: "SKU-1",
        imageData: "data:image/png;base64,aW1hZ2U=",
      }),
    ).rejects.toThrow("media persistence failed");

    expect(tenantTransaction).toHaveBeenCalledTimes(1);
    expect(persistUpload).toHaveBeenCalledWith(context.tenantId, "data:image/png;base64,aW1hZ2U=");
    expect(removeUploadedFile).toHaveBeenCalledWith("C:/uploads/product.png");
  });
});
