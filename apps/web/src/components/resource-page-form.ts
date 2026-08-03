export async function prepareResourcePayload(
  form: FormData,
  transform?: (form: FormData) => Record<string, unknown>,
) {
  const payload = transform ? transform(form) : Object.fromEntries(form.entries());
  const imageFile = form.get("imageFile");
  if (imageFile instanceof File && imageFile.size) {
    if (!imageFile.type.match(/^image\/(png|jpeg|webp)$/) || imageFile.size > 5 * 1024 * 1024) {
      throw new Error("Selecione uma imagem PNG, JPEG ou WebP de até 5 MB.");
    }
    payload.imageData = await fileAsDataUrl(imageFile);
  }
  return payload;
}

export function clearFileInput(input: HTMLInputElement | null) {
  if (input) input.value = "";
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Não foi possível ler a imagem selecionada."));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
