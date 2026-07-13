"use client";

import {
  Autocomplete,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  Input,
  PageHeader,
  Select,
} from "@sgc/ui";
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Landmark,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  ScanBarcode,
  WalletCards,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch, openApiDocument } from "../../../lib/api";

interface ListResponse<T> {
  data: T[];
}
interface Branch {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  salePrice: string;
}
interface Customer {
  id: string;
  name: string;
  document?: string;
}
interface LoyaltyWallet {
  customerId: string;
  pointsBalance: number;
}
interface LoyaltyReward {
  id: string;
  name: string;
  rewardType: "discount" | "coupon" | "cashback" | "bonus_product";
  pointsRequired: number;
  valueAmount?: number;
}
interface CashSession {
  id: string;
  branch_id: string;
  opening_amount: string;
  opened_at: string;
}
interface CashHistory {
  id: string;
  status: string;
  openingAmount: string;
  expectedAmount: string;
  closingAmount?: string;
  differenceAmount?: string;
  openedAt: string;
  closedAt?: string;
  approvalStatus?: string;
}
interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}
interface PrintingSettings {
  receiptMode: string;
  receiptWidth?: string;
  receiptCopies: number;
  defaultPrinterName?: string;
  silentPrint: boolean;
}

export default function PosPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [wallets, setWallets] = useState<LoyaltyWallet[]>([]);
  const [loyaltyRewards, setLoyaltyRewards] = useState<LoyaltyReward[]>([]);
  const [branchId, setBranchId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerDocument, setCustomerDocument] = useState("");
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState(0);
  const [loyaltyRewardId, setLoyaltyRewardId] = useState("");
  const [loyaltyCouponCode, setLoyaltyCouponCode] = useState("");
  const [notice, setNotice] = useState("");
  const [fiscalRequested, setFiscalRequested] = useState(false);
  const [cash, setCash] = useState<CashSession | null>(null);
  const [cashHistory, setCashHistory] = useState<CashHistory[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanner, setScanner] = useState("");
  const [scanQuantity, setScanQuantity] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [productSuggestions, setProductSuggestions] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentParts, setPaymentParts] = useState<
    Array<{ method: string; amount: number; status: "paid" }>
  >([]);
  const [pendingSync, setPendingSync] = useState(0);
  const [printing, setPrinting] = useState<PrintingSettings | null>(null);
  const [printAfterSale, setPrintAfterSale] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productionMode, setProductionMode] = useState(false);
  const scannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([
      apiFetch<ListResponse<Branch>>("/branches?pageSize=100&isActive=true"),
      apiFetch<ListResponse<Product>>("/products?pageSize=100&isActive=true"),
      apiFetch<ListResponse<Customer>>("/customers?pageSize=100&isActive=true"),
      apiFetch<ListResponse<LoyaltyWallet>>("/loyalty/wallets"),
    ])
      .then(([b, p, c, w]) => {
        setBranches(b.data);
        setProducts(p.data);
        setCustomers(c.data);
        setWallets(w.data);
        setBranchId((current) => current || b.data[0]?.id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao abrir o PDV."));
  }, []);
  useEffect(() => {
    const onFullscreenChange = () => setProductionMode(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  function repeatLastSale() {
    const last = window.localStorage.getItem("orien.pos.last-cart");
    if (!last) {
      setError("Ainda não há uma venda anterior neste dispositivo.");
      return;
    }
    try {
      const saved = JSON.parse(last) as { items: CartItem[]; branchId: string };
      setCart(saved.items);
      if (saved.branchId) setBranchId(saved.branchId);
      setPaymentParts([]);
      setError(null);
    } catch {
      setError("Não foi possível recuperar a última composição.");
    }
  }
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const queueKey = "orien.pos.pending-sales";
    const sync = async () => {
      const pending = JSON.parse(window.localStorage.getItem(queueKey) ?? "[]") as Array<{
        payload: Record<string, unknown>;
        idempotencyKey: string;
      }>;
      if (!pending.length || !navigator.onLine) return setPendingSync(pending.length);
      const remaining: Array<Record<string, unknown>> = [];
      for (const sale of pending) {
        try {
          await apiFetch("/sales", {
            method: "POST",
            headers: { "idempotency-key": sale.idempotencyKey },
            body: JSON.stringify(sale.payload),
          });
        } catch {
          remaining.push(sale);
        }
      }
      window.localStorage.setItem(queueKey, JSON.stringify(remaining));
      setPendingSync(remaining.length);
    };
    void sync();
    const online = () => {
      setIsOnline(true);
      void sync();
    };
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    const search = productSearch.trim();
    if (search.length < 2) {
      setProductSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      void apiFetch<ListResponse<Product>>(
        `/products?pageSize=8&isActive=true&search=${encodeURIComponent(search)}`,
      )
        .then((result) => setProductSuggestions(result.data))
        .catch(() => setProductSuggestions([]));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [productSearch]);
  useEffect(() => {
    if (!branchId) return;
    void Promise.all([
      apiFetch<CashSession | null>(`/cash-registers/current?branchId=${branchId}`),
      apiFetch<{ data: CashHistory[] }>(`/cash-registers?branchId=${branchId}`),
      apiFetch<PrintingSettings>(`/printing-settings?branchId=${branchId}`),
    ])
      .then(([current, history, printSettings]) => {
        setCash(current);
        setCashHistory(history.data);
        setPrinting(printSettings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Falha ao consultar caixa."));
  }, [branchId]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key === "F2") {
        event.preventDefault();
        scannerRef.current?.focus();
      }
      if (event.key === "F4") setPaymentMethod("cash");
      if (event.key === "F6") setPaymentMethod("pix");
      if (event.key === "F7") setPaymentMethod("asaas_pix");
      if (event.key === "F8") setPaymentMethod("card");
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount, 0),
    [cart],
  );
  const selectedWallet = wallets.find((wallet) => wallet.customerId === customerId);
  const loyaltyDiscount = Math.min(total, Math.max(0, loyaltyPointsToRedeem) * 0.01);
  const payableTotal = Math.max(0, total - loyaltyDiscount);
  const allocatedPayment = paymentParts.reduce((sum, item) => sum + item.amount, 0);
  const remainingPayment = Math.max(0, payableTotal - allocatedPayment);
  const typedPayment = Number(paymentAmount || 0);
  const estimatedChange =
    paymentMethod === "cash" ? Math.max(0, typedPayment - remainingPayment) : 0;
  const branchOptions = branches.map((branch) => ({ label: branch.name, value: branch.id }));
  const customerOptions = [
    { label: "Consumidor final", value: "" },
    ...customers.map((customer) => ({ label: customer.name, value: customer.id })),
  ];
  useEffect(() => {
    const selected = customers.find((customer) => customer.id === customerId);
    if (selected?.document) setCustomerDocument(selected.document);
    setLoyaltyPointsToRedeem(0);
    setLoyaltyRewardId("");
    if (!customerId) {
      setLoyaltyRewards([]);
      return;
    }
    void apiFetch<{ data: LoyaltyReward[] }>(`/loyalty/rewards/available?customerId=${customerId}`)
      .then((result) => setLoyaltyRewards(result.data))
      .catch(() => setLoyaltyRewards([]));
  }, [customerId, customers]);

  async function scan() {
    const parsed = parseQuantityCode(scanner);
    const product = products.find(
      (item) => item.barcode === parsed.code || item.sku === parsed.code,
    );
    if (!product) {
      setError(`Produto não encontrado para ${parsed.code}.`);
      return;
    }
    await addProduct(product, parsed.quantity ?? scanQuantity);
    setScanner("");
    setScanQuantity(1);
    scannerRef.current?.focus();
  }
  async function addFirstManualSuggestion() {
    const product =
      productSuggestions[0] ??
      products.find((item) => {
        const search = productSearch.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(search) ||
          item.sku?.toLowerCase() === search ||
          item.barcode === search
        );
      });
    if (!product) {
      setError("Nenhum produto encontrado para a busca informada.");
      return;
    }
    await addProduct(product, manualQuantity);
  }

  async function addProduct(product: Product, quantity = 1) {
    const quantityToAdd = Math.max(1, Math.floor(Number(quantity) || 1));
    const currentQuantity = cart.find((item) => item.productId === product.id)?.quantity ?? 0;
    let resolvedPrice = Number(product.salePrice);
    try {
      const pricing = await apiFetch<{ price: number }>(
        `/operations/prices/resolve?productId=${product.id}&branchId=${branchId}&quantity=${currentQuantity + quantityToAdd}`,
      );
      resolvedPrice = pricing.price;
    } catch {
      // O preco base permanece disponivel se nenhuma regra promocional for aplicavel.
    }
    setCart((current) =>
      current.some((item) => item.productId === product.id)
        ? current.map((item) =>
            item.productId === product.id
              ? { ...item, quantity: item.quantity + quantityToAdd, unitPrice: resolvedPrice }
              : item,
          )
        : [
            ...current,
            {
              productId: product.id,
              name: product.name,
              quantity: quantityToAdd,
              unitPrice: resolvedPrice,
              discountAmount: 0,
            },
          ],
    );
    setProductSearch("");
    setProductSuggestions([]);
    setManualQuantity(1);
    setError(null);
  }

  async function openCash(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const opened = await apiFetch<CashSession>("/cash-registers/open", {
        method: "POST",
        body: JSON.stringify({ branchId, openingAmount: Number(form.get("openingAmount") || 0) }),
      });
      setCash(opened);
      scannerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao abrir caixa.");
    }
  }
  async function closeCash() {
    if (!cash) return;
    const value = window.prompt("Conferencia cega: informe o valor contado no caixa:");
    if (value === null) return;
    try {
      await apiFetch(`/cash-registers/${cash.id}/close`, {
        method: "POST",
        body: JSON.stringify({ closingAmount: Number(value) }),
      });
      const history = await apiFetch<{ data: CashHistory[] }>(
        `/cash-registers?branchId=${branchId}`,
      );
      setCashHistory(history.data);
      setCash(null);
      setCart([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao fechar caixa.");
    }
  }
  async function cashMovement(type: "supply" | "withdrawal") {
    if (!cash) return;
    const amount = window.prompt(type === "supply" ? "Valor do suprimento:" : "Valor da sangria:");
    if (!amount) return;
    const reason = window.prompt("Motivo da movimentação:");
    if (!reason) return;
    try {
      await apiFetch(`/cash-registers/${cash.id}/movements`, {
        method: "POST",
        body: JSON.stringify({ type, amount: Number(amount), reason }),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na movimentação do caixa.");
    }
  }
  function addPayment() {
    const received = Number(paymentAmount || remainingPayment);
    const amount = Math.min(remainingPayment, received);
    if (amount <= 0) return;
    setPaymentParts((current) => [...current, { method: paymentMethod, amount, status: "paid" }]);
    setPaymentAmount("");
  }
  async function toggleProductionMode() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setError("O navegador não permitiu abrir a tela cheia. Use o atalho F11 como alternativa.");
    }
  }
  async function finishSale() {
    if (!cash || !cart.length) return;
    const payments = paymentParts.length
      ? paymentParts
      : [{ method: paymentMethod, amount: payableTotal, status: "paid" as const }];
    const paid = payments.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(paid - payableTotal) > 0.009) {
      setError("A soma dos pagamentos precisa ser igual ao total da venda.");
      return;
    }
    try {
      const payload = {
        branchId,
        customerId: customerId || undefined,
        customerDocument: customerDocument || undefined,
        loyaltyPointsToRedeem,
        loyaltyRewardId: loyaltyRewardId || undefined,
        loyaltyCouponCode: loyaltyCouponCode.trim().toUpperCase() || undefined,
        fiscalRequested,
        cashRegisterSessionId: cash.id,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
        })),
        payments,
      };
      window.localStorage.setItem("orien.pos.last-cart", JSON.stringify({ items: cart, branchId }));
      if (!navigator.onLine) {
        const queueKey = "orien.pos.pending-sales";
        const pending = JSON.parse(window.localStorage.getItem(queueKey) ?? "[]") as Array<{
          payload: Record<string, unknown>;
          idempotencyKey: string;
        }>;
        pending.push({ payload, idempotencyKey: createIdempotencyKey() });
        window.localStorage.setItem(queueKey, JSON.stringify(pending));
        setPendingSync(pending.length);
      } else {
        const result = await apiFetch<{
          id?: string;
          sale?: { id?: string };
          loyalty?: { type: string; rewardName: string; couponCode?: string };
        }>("/sales", {
          method: "POST",
          headers: { "idempotency-key": createIdempotencyKey() },
          body: JSON.stringify(payload),
        });
        const saleId = result.id ?? result.sale?.id;
        if (result.loyalty?.couponCode)
          setNotice(
            `Cupom ${result.loyalty.couponCode} emitido para ${result.loyalty.rewardName}.`,
          );
        else if (result.loyalty?.type === "cashback")
          setNotice(`Crédito de fidelidade lançado para ${result.loyalty.rewardName}.`);
        else if (result.loyalty?.type === "bonus_product")
          setNotice(`Brinde ${result.loyalty.rewardName} incluído na venda.`);
        if (saleId && printAfterSale && printing?.receiptMode !== "none") {
          const shouldOpenPrint = printing?.receiptMode === "thermal" || printing?.silentPrint;
          const receiptPath =
            printing?.receiptMode === "thermal"
              ? `/sales/${saleId}/receipt`
              : `/sales/${saleId}/document`;
          void openApiDocument(receiptPath, shouldOpenPrint).catch(() => undefined);
        }
      }
      setCart([]);
      setPaymentParts([]);
      setLoyaltyPointsToRedeem(0);
      setLoyaltyRewardId("");
      setLoyaltyCouponCode("");
      setError(null);
      scannerRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao concluir venda.");
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="PDV rápido"
        description="Scanner sempre disponível, atalhos de pagamento e controle de abertura e fechamento do caixa."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={repeatLastSale} disabled={!cash}>
              Repetir última venda
            </Button>
            <Button
              variant="secondary"
              icon={productionMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              onClick={() => void toggleProductionMode()}
            >
              {productionMode ? "Sair da tela cheia" : "Modo produção"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void cashMovement("supply")}
              disabled={!cash}
            >
              Suprimento
            </Button>
            <Button
              variant="secondary"
              onClick={() => void cashMovement("withdrawal")}
              disabled={!cash}
            >
              Sangria
            </Button>
            <Button variant="secondary" onClick={() => void closeCash()} disabled={!cash}>
              Fechar caixa
            </Button>
          </div>
        }
      />
      {pendingSync ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {pendingSync} venda(s) aguardando sincronização. Elas serão enviadas quando a conexão
          voltar.
        </p>
      ) : null}
      <section className="grid gap-3 rounded-md border border-[var(--brand-border)] bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            cash ? "Caixa aberto" : "Abrir caixa",
            cart.length ? `${cart.length} item(ns)` : "Adicionar produtos",
            paymentParts.length ? "Pagamento dividido" : "Escolher pagamento",
            isOnline ? "Online" : "Offline com fila",
          ].map((step, index) => (
            <div key={step} className="rounded-md bg-[var(--brand-surface)] px-3 py-2 text-sm">
              <span className="mr-2 font-semibold text-[var(--brand-secondary)]">{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge>{isOnline ? "Sincronização imediata" : "Venda será enviada depois"}</Badge>
          <Badge>
            {printing
              ? `Comprovante: ${receiptModeLabel(printing.receiptMode)} · ${printing.receiptCopies} via(s)`
              : "Comprovante: padrão da loja"}
          </Badge>
        </div>
      </section>
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="min-w-0">
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Select
                  label="Loja"
                  value={branchId}
                  options={branchOptions}
                  onChange={(event) => setBranchId(event.target.value)}
                />
              </div>
              <Badge>{cash ? "Caixa aberto" : "Caixa fechado"}</Badge>
            </div>
            {!cash ? (
              <form
                className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end"
                onSubmit={(event) => void openCash(event)}
              >
                <Input
                  name="openingAmount"
                  label="Fundo de troco"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
                <Button type="submit">Abrir caixa</Button>
              </form>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
                  <Select
                    label="Cliente"
                    value={customerId}
                    options={customerOptions}
                    onChange={(event) => setCustomerId(event.target.value)}
                  />
                  <Input
                    label="CPF/CNPJ na nota"
                    value={customerDocument}
                    placeholder="Opcional"
                    onChange={(event) => setCustomerDocument(event.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <Input
                    ref={scannerRef}
                    label="Leitor de código de barras · F2"
                    value={scanner}
                    placeholder="Leia o código, use 3*789 ou 789*3 e pressione Enter"
                    onChange={(event) => setScanner(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void scan();
                      }
                    }}
                  />
                  <Input
                    label="Qtd"
                    type="number"
                    min={1}
                    value={scanQuantity}
                    onChange={(event) =>
                      setScanQuantity(Math.max(1, Number(event.target.value || 1)))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                  <Autocomplete
                    label="Adicionar produto manualmente"
                    value={productSearch}
                    placeholder="Digite nome, SKU ou código"
                    onValueChange={setProductSearch}
                    options={productSuggestions.map((product) => ({
                      value: product.id,
                      label: product.name,
                      detail: `${[product.sku, product.barcode].filter(Boolean).join(" · ") || "Sem código"} · ${Number(
                        product.salePrice,
                      ).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}`,
                    }))}
                    emptyText="Nenhum produto encontrado. Confira o nome, SKU ou código."
                    onOptionSelect={(option) => {
                      const product = productSuggestions.find((item) => item.id === option.value);
                      if (product) void addProduct(product, manualQuantity);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void addFirstManualSuggestion();
                      }
                    }}
                  />
                  <Input
                    label="Qtd"
                    type="number"
                    min={1}
                    value={manualQuantity}
                    onChange={(event) =>
                      setManualQuantity(Math.max(1, Number(event.target.value || 1)))
                    }
                  />
                </div>
              </div>
            )}
            <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1">
              {cart.length ? (
                cart.map((item) => (
                  <div
                    key={item.productId}
                    className="grid gap-2 rounded-md border border-[var(--brand-border)] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.unitPrice.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="grid h-12 w-12 place-items-center rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-primary)] transition hover:bg-[var(--brand-surface)]"
                        onClick={() =>
                          setCart((current) =>
                            current.map((row) =>
                              row.productId === item.productId
                                ? { ...row, quantity: Math.max(1, row.quantity - 1) }
                                : row,
                            ),
                          )
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <input
                        aria-label={`Quantidade de ${item.name}`}
                        className="h-12 w-20 rounded-md border border-[var(--brand-border)] bg-white text-center text-base font-semibold text-[var(--brand-primary)]"
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) => {
                          const nextQuantity = Math.max(1, Number(event.target.value || 1));
                          setCart((current) =>
                            current.map((row) =>
                              row.productId === item.productId
                                ? { ...row, quantity: nextQuantity }
                                : row,
                            ),
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="grid h-12 w-12 place-items-center rounded-md border border-[var(--brand-border)] bg-white text-[var(--brand-primary)] transition hover:bg-[var(--brand-surface)]"
                        onClick={() =>
                          setCart((current) =>
                            current.map((row) =>
                              row.productId === item.productId
                                ? { ...row, quantity: row.quantity + 1 }
                                : row,
                            ),
                          )
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      onClick={() =>
                        setCart((current) =>
                          current.filter((row) => row.productId !== item.productId),
                        )
                      }
                    >
                      <X size={15} />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="grid min-h-[12rem] place-items-center gap-2 rounded-md border border-dashed border-[var(--brand-border)] px-4 py-10 text-center text-slate-500">
                  <ScanBarcode size={28} />
                  <p>Abra o caixa, leia um código ou pesquise o primeiro produto.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card variant="brand" className="h-fit xl:sticky xl:top-24">
          <CardContent className="grid gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/70">Total da venda</p>
              <p className="mt-2 text-5xl font-semibold text-white">
                {payableTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              {loyaltyDiscount > 0 ? (
                <p className="mt-2 text-sm text-[var(--brand-accent)]">
                  Desconto por pontos:{" "}
                  {loyaltyDiscount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </p>
              ) : null}
            </div>
            {customerId ? (
              <div className="rounded-md border border-white/15 bg-white/5 p-3 text-sm text-white/75">
                <div className="flex items-center justify-between gap-3">
                  <span>Pontos disponíveis</span>
                  <strong>{selectedWallet?.pointsBalance ?? 0}</strong>
                </div>
                <Input
                  label="Usar pontos como desconto"
                  type="number"
                  min={0}
                  max={selectedWallet?.pointsBalance ?? 0}
                  value={loyaltyPointsToRedeem}
                  onChange={(event) =>
                    setLoyaltyPointsToRedeem(
                      Math.min(
                        selectedWallet?.pointsBalance ?? 0,
                        Math.max(0, Number(event.target.value || 0)),
                      ),
                    )
                  }
                />
                <Input
                  label="Aplicar cupom de fidelidade"
                  value={loyaltyCouponCode}
                  onChange={(event) => setLoyaltyCouponCode(event.target.value.toUpperCase())}
                  placeholder="Ex.: LOY-AB12CD34"
                  disabled={Boolean(loyaltyRewardId)}
                />
                {loyaltyRewards.length ? (
                  <Select
                    label="Resgatar recompensa"
                    value={loyaltyRewardId}
                    onChange={(event) => {
                      const reward = loyaltyRewards.find((item) => item.id === event.target.value);
                      setLoyaltyRewardId(event.target.value);
                      if (event.target.value) setLoyaltyCouponCode("");
                      if (reward) setLoyaltyPointsToRedeem(reward.pointsRequired);
                    }}
                    options={[
                      { label: "Usar pontos livremente", value: "" },
                      ...loyaltyRewards.map((reward) => ({
                        label: `${reward.name} · ${reward.pointsRequired} pontos · ${rewardTypeLabel(reward.rewardType)}`,
                        value: reward.id,
                      })),
                    ]}
                  />
                ) : null}
                <p className="mt-1 text-xs text-white/55">100 pontos equivalem a R$ 1,00 no PDV.</p>
              </div>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              <PaymentButton
                active={paymentMethod === "cash"}
                label="Dinheiro F4"
                icon={<Banknote size={18} />}
                onClick={() => setPaymentMethod("cash")}
              />
              <PaymentButton
                active={paymentMethod === "pix"}
                label="Pix F6"
                icon={<WalletCards size={18} />}
                onClick={() => setPaymentMethod("pix")}
              />
              <PaymentButton
                active={paymentMethod === "asaas_pix"}
                label="Pix Asaas F7"
                icon={<WalletCards size={18} />}
                onClick={() => setPaymentMethod("asaas_pix")}
              />
              <PaymentButton
                active={paymentMethod === "credit_card"}
                label="Crédito F8"
                icon={<CreditCard size={18} />}
                onClick={() => setPaymentMethod("credit_card")}
              />
              <PaymentButton
                active={paymentMethod === "debit_card"}
                label="Débito"
                icon={<CreditCard size={18} />}
                onClick={() => setPaymentMethod("debit_card")}
              />
              <PaymentButton
                active={paymentMethod === "store_credit"}
                label="Crediário"
                icon={<CircleDollarSign size={18} />}
                onClick={() => setPaymentMethod("store_credit")}
              />
              <PaymentButton
                active={paymentMethod === "bank_transfer"}
                label="Transferência"
                icon={<Landmark size={18} />}
                onClick={() => setPaymentMethod("bank_transfer")}
              />
              <PaymentButton
                active={paymentMethod === "other"}
                label="Outra forma"
                icon={<WalletCards size={18} />}
                onClick={() => setPaymentMethod("other")}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="h-10 min-w-0 rounded-md border border-white/20 bg-white px-3 text-sm text-slate-950"
                type="number"
                step="0.01"
                value={paymentAmount}
                placeholder="Valor desta forma"
                onChange={(event) => setPaymentAmount(event.target.value)}
              />
              <Button variant="secondary" onClick={addPayment}>
                Adicionar
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2" aria-label="Teclado numérico do pagamento">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "Limpar"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className="h-9 rounded-md border border-white/15 bg-white/10 text-sm font-medium text-white transition hover:bg-white/20"
                  onClick={() =>
                    setPaymentAmount((current) => (key === "Limpar" ? "" : `${current}${key}`))
                  }
                >
                  {key}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-between gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75">
              <span>
                Restante:{" "}
                <strong>
                  {remainingPayment.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </strong>
              </span>
              {estimatedChange > 0 ? (
                <span className="text-[var(--brand-accent)]">
                  Troco:{" "}
                  <strong>
                    {estimatedChange.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                </span>
              ) : null}
            </div>
            {paymentParts.length ? (
              <div className="grid gap-1 text-xs text-white/75">
                {paymentParts.map((part, index) => (
                  <div key={index} className="flex justify-between">
                    <span>{paymentMethodLabel(part.method)}</span>
                    <span>
                      {part.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  className="mt-1 text-left text-[var(--brand-accent)]"
                  onClick={() => setPaymentParts([])}
                >
                  Limpar divisão
                </button>
              </div>
            ) : null}
            <label className="flex items-start gap-2 rounded-md border border-white/15 bg-white/5 p-3 text-xs leading-5 text-white/75">
              <input
                type="checkbox"
                className="mt-1"
                checked={printAfterSale}
                onChange={(event) => setPrintAfterSale(event.target.checked)}
              />
              <span>
                Abrir comprovante de conferência ao concluir. O documento não tem valor fiscal e usa
                o padrão salvo em Impressoras.
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-white/15 bg-white/5 p-3 text-xs leading-5 text-white/75">
              <input
                type="checkbox"
                className="mt-1"
                checked={fiscalRequested}
                onChange={(event) => setFiscalRequested(event.target.checked)}
              />
              <span>
                Solicitar NFC-e após a venda quando a integração fiscal estiver configurada.
              </span>
            </label>
            <Button
              className="min-h-12 w-full bg-[var(--brand-accent)] text-base text-[var(--brand-primary)] hover:brightness-95"
              disabled={!cash || !cart.length}
              onClick={() => void finishSale()}
            >
              Concluir venda
            </Button>
            <p className="text-xs leading-5 text-white/65">
              Fechamento enxuto: adicione produtos, escolha uma ou mais formas de pagamento e
              conclua. O comprovante usa o padrão da loja configurado em Impressoras.
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="grid gap-3">
          <h2 className="font-semibold">Histórico de caixas</h2>
          <DataTable
            rows={cashHistory}
            empty="Nenhum caixa registrado nesta loja."
            columns={[
              {
                key: "opened",
                header: "Abertura",
                render: (row) => new Date(row.openedAt).toLocaleString("pt-BR"),
              },
              {
                key: "status",
                header: "Status",
                render: (row) => <Badge>{row.status === "open" ? "Aberto" : "Fechado"}</Badge>,
              },
              {
                key: "expected",
                header: "Esperado",
                render: (row) =>
                  Number(row.expectedAmount).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }),
              },
              {
                key: "closing",
                header: "Contado",
                render: (row) =>
                  row.closingAmount
                    ? Number(row.closingAmount).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })
                    : "-",
              },
              {
                key: "approval",
                header: "Aprovacao",
                render: (row) =>
                  row.approvalStatus === "pending" ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void apiFetch(`/cash-registers/${row.id}/approve`, {
                          method: "POST",
                          body: "{}",
                        }).then(() =>
                          setCashHistory((current) =>
                            current.map((item) =>
                              item.id === row.id ? { ...item, approvalStatus: "approved" } : item,
                            ),
                          ),
                        )
                      }
                    >
                      Aprovar divergencia
                    </Button>
                  ) : (
                    <Badge>{row.approvalStatus === "approved" ? "Aprovada" : "Regular"}</Badge>
                  ),
              },
              {
                key: "difference",
                header: "Diferença",
                render: (row) => (
                  <span
                    className={
                      Number(row.differenceAmount ?? 0) !== 0
                        ? "font-medium text-rose-600"
                        : "text-slate-600"
                    }
                  >
                    {Number(row.differenceAmount ?? 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function createIdempotencyKey() {
  return `pos_${crypto.randomUUID().replaceAll("-", "")}`;
}
function parseQuantityCode(value: string) {
  const input = value.trim();
  const left = input.match(/^(\d+(?:[,.]\d+)?)\*(.+)$/);
  const right = input.match(/^(.+)\*(\d+(?:[,.]\d+)?)$/);
  const quantity = left
    ? Number(left[1]!.replace(",", "."))
    : right
      ? Number(right[2]!.replace(",", "."))
      : undefined;
  const code = left ? left[2]!.trim() : right ? right[1]!.trim() : input;
  return { code, quantity: quantity && quantity > 0 ? quantity : undefined };
}
function receiptModeLabel(mode: string) {
  if (mode === "none") return "não imprimir";
  if (mode === "thermal") return "térmico";
  return "navegador";
}

function rewardTypeLabel(type: LoyaltyReward["rewardType"]) {
  return (
    (
      {
        discount: "desconto",
        coupon: "cupom",
        cashback: "crédito",
        bonus_product: "brinde",
      } as Record<LoyaltyReward["rewardType"], string>
    )[type] ?? type
  );
}

function paymentMethodLabel(method: string) {
  return (
    (
      {
        cash: "Dinheiro",
        pix: "Pix",
        asaas_pix: "Pix Asaas",
        credit_card: "Cartão de crédito",
        debit_card: "Cartão de débito",
        store_credit: "Crediário",
        bank_transfer: "Transferência",
        other: "Outra forma",
        card: "Cartão",
      } as Record<string, string>
    )[method] ?? method
  );
}

function PaymentButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`grid min-h-14 place-items-center gap-1 rounded-md border p-2 text-xs ${active ? "border-[var(--brand-accent)] bg-white text-[var(--brand-primary)]" : "border-white/15 bg-white/5 text-white"}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
