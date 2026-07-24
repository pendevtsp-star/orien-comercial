export interface PaymentFeeResolutionInput {
  grossAmountCents: number;
  percentageBasisPoints: number;
  fixedFeeCents: number;
  anticipationBasisPoints: number;
  settlementDays: number;
  occurredAt: Date;
}

export interface PaymentFeeResolution {
  grossAmountCents: number;
  processingFeeCents: number;
  anticipationFeeCents: number;
  totalFeeCents: number;
  netAmountCents: number;
  expectedSettlementDate: string;
}

export function resolvePaymentFee(input: PaymentFeeResolutionInput): PaymentFeeResolution {
  assertIntegerInRange(input.grossAmountCents, 1, Number.MAX_SAFE_INTEGER, "valor bruto");
  assertIntegerInRange(input.percentageBasisPoints, 0, 10_000, "taxa percentual");
  assertIntegerInRange(input.fixedFeeCents, 0, Number.MAX_SAFE_INTEGER, "taxa fixa");
  assertIntegerInRange(input.anticipationBasisPoints, 0, 10_000, "taxa de antecipação");
  assertIntegerInRange(input.settlementDays, 0, 3650, "prazo de liquidação");
  if (Number.isNaN(input.occurredAt.getTime())) throw new Error("Data da operação inválida.");

  const percentageFeeCents = multiplyBasisPointsRoundHalfUp(input.grossAmountCents, input.percentageBasisPoints);
  const processingFeeCents = percentageFeeCents + input.fixedFeeCents;
  const amountAfterProcessing = input.grossAmountCents - processingFeeCents;
  if (amountAfterProcessing < 0) throw new Error("As taxas não podem exceder o valor bruto.");

  const anticipationFeeCents = multiplyBasisPointsRoundHalfUp(amountAfterProcessing, input.anticipationBasisPoints);
  const totalFeeCents = processingFeeCents + anticipationFeeCents;
  const netAmountCents = input.grossAmountCents - totalFeeCents;
  if (netAmountCents < 0) throw new Error("As taxas não podem exceder o valor bruto.");

  const expected = new Date(input.occurredAt);
  expected.setUTCDate(expected.getUTCDate() + input.settlementDays);

  return {
    grossAmountCents: input.grossAmountCents,
    processingFeeCents,
    anticipationFeeCents,
    totalFeeCents,
    netAmountCents,
    expectedSettlementDate: expected.toISOString().slice(0, 10),
  };
}

function multiplyBasisPointsRoundHalfUp(amountCents: number, basisPoints: number) {
  const result = (BigInt(amountCents) * BigInt(basisPoints) + 5_000n) / 10_000n;
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) throw new Error("Resultado financeiro fora do limite seguro.");
  return asNumber;
}

function assertIntegerInRange(value: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label} inválido.`);
  }
}
