export type FiscalReadinessStatus = "pending" | "blocked" | "ready";

export interface FiscalReadinessInput {
  ncm?: string | null;
  cest?: string | null;
  taxOrigin?: string | null;
  cfopDomestic?: string | null;
  cfopInterstate?: string | null;
  icmsTaxCode?: string | null;
  pisTaxCode?: string | null;
  cofinsTaxCode?: string | null;
  subjectToIcmsSt?: boolean | null;
  accountantApprovedAt?: string | Date | null;
}

const requiredFields: Array<[keyof FiscalReadinessInput, string]> = [
  ["ncm", "NCM"],
  ["taxOrigin", "origem da mercadoria"],
  ["cfopDomestic", "CFOP interno"],
  ["cfopInterstate", "CFOP interestadual"],
  ["icmsTaxCode", "CST/CSOSN"],
  ["pisTaxCode", "CST PIS"],
  ["cofinsTaxCode", "CST COFINS"],
];

export function fiscalReadiness(input: FiscalReadinessInput | null | undefined) {
  const missing = requiredFields.filter(([field]) => !input?.[field]).map(([, label]) => label);

  if (input?.subjectToIcmsSt && !input.cest) missing.push("CEST");

  const started = Boolean(
    input &&
    Object.entries(input).some(
      ([key, value]) =>
        key !== "accountantApprovedAt" &&
        value !== null &&
        value !== undefined &&
        value !== "" &&
        value !== false,
    ),
  );
  const status: FiscalReadinessStatus =
    missing.length === 0 ? "ready" : started ? "blocked" : "pending";

  return {
    status,
    label:
      status === "ready"
        ? "Apto para emissão"
        : status === "blocked"
          ? "Cadastro fiscal bloqueado"
          : "Cadastro fiscal pendente",
    missing,
    reviewedByAccountant: Boolean(input?.accountantApprovedAt),
  };
}
