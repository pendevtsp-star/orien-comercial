import { BadRequestException } from "@nestjs/common";
import { FocusNfeProvider } from "./focus-nfe.provider";
import {
  fiscalProviderCatalog,
  type FiscalEnvironment,
  type FiscalProvider,
  type FiscalProviderKey,
} from "./fiscal-provider";

export function createFiscalProvider(
  provider: string | undefined,
  token: string,
  environment: FiscalEnvironment,
): FiscalProvider {
  const key = (provider ?? "focus_nfe") as FiscalProviderKey;
  if (key === "focus_nfe") return new FocusNfeProvider(token, environment);
  const descriptor = fiscalProviderCatalog[key];
  if (descriptor?.status === "planned") {
    throw new BadRequestException(
      `${descriptor.label} está preparado na Orien, mas ainda aguarda homologação técnica e credenciais do provedor.`,
    );
  }
  throw new BadRequestException("Provedor fiscal não reconhecido.");
}
