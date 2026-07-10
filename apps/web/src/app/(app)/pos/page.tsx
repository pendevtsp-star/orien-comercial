"use client";

import { Badge, Button, Card, CardContent, Input, PageHeader, Select } from "@sgc/ui";
import { Banknote, CreditCard, Minus, Plus, ScanBarcode, WalletCards, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiFetch } from "../../../lib/api";

interface ListResponse<T> { data: T[] }
interface Branch { id: string; name: string }
interface Product { id: string; name: string; sku?: string; barcode?: string; salePrice: string }
interface CashSession { id: string; branch_id: string; opening_amount: string; opened_at: string }
interface CartItem { productId: string; name: string; quantity: number; unitPrice: number; discountAmount: number }

export default function PosPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchId, setBranchId] = useState("");
  const [cash, setCash] = useState<CashSession | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanner, setScanner] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void Promise.all([apiFetch<ListResponse<Branch>>("/branches?pageSize=100&isActive=true"), apiFetch<ListResponse<Product>>("/products?pageSize=100&isActive=true")]).then(([b, p]) => { setBranches(b.data); setProducts(p.data); setBranchId((current) => current || b.data[0]?.id || ""); }).catch((err) => setError(err instanceof Error ? err.message : "Falha ao abrir o PDV.")); }, []);
  useEffect(() => { if (!branchId) return; void apiFetch<CashSession | null>(`/cash-registers/current?branchId=${branchId}`).then(setCash).catch((err) => setError(err instanceof Error ? err.message : "Falha ao consultar caixa.")); }, [branchId]);
  useEffect(() => { function shortcut(event: KeyboardEvent) { if (event.key === "F2") { event.preventDefault(); scannerRef.current?.focus(); } if (event.key === "F4") setPaymentMethod("cash"); if (event.key === "F6") setPaymentMethod("pix"); if (event.key === "F8") setPaymentMethod("card"); } window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut); }, []);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discountAmount, 0), [cart]);
  const branchOptions = branches.map((branch) => ({ label: branch.name, value: branch.id }));

  function scan() {
    const code = scanner.trim(); const product = products.find((item) => item.barcode === code || item.sku === code);
    if (!product) { setError(`Produto não encontrado para ${code}.`); return; }
    setCart((current) => current.some((item) => item.productId === product.id) ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { productId: product.id, name: product.name, quantity: 1, unitPrice: Number(product.salePrice), discountAmount: 0 }]);
    setScanner(""); setError(null); scannerRef.current?.focus();
  }

  async function openCash(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { const opened = await apiFetch<CashSession>("/cash-registers/open", { method: "POST", body: JSON.stringify({ branchId, openingAmount: Number(form.get("openingAmount") || 0) }) }); setCash(opened); scannerRef.current?.focus(); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao abrir caixa."); } }
  async function closeCash() { if (!cash) return; const value = window.prompt("Valor contado no fechamento:", total.toFixed(2)); if (value === null) return; try { await apiFetch(`/cash-registers/${cash.id}/close`, { method: "POST", body: JSON.stringify({ closingAmount: Number(value) }) }); setCash(null); setCart([]); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao fechar caixa."); } }
  async function finishSale() { if (!cash || !cart.length) return; try { await apiFetch("/sales", { method: "POST", body: JSON.stringify({ branchId, cashRegisterSessionId: cash.id, items: cart.map(({ name: _name, ...item }) => item), payments: [{ method: paymentMethod, amount: total, status: "paid" }] }) }); setCart([]); setError(null); scannerRef.current?.focus(); } catch (err) { setError(err instanceof Error ? err.message : "Falha ao concluir venda."); } }

  return <div className="grid gap-5">
    <PageHeader title="PDV rápido" description="Scanner sempre disponível, atalhos de pagamento e controle de abertura e fechamento do caixa." actions={<Button variant="secondary" onClick={() => void closeCash()} disabled={!cash}>Fechar caixa</Button>} />
    {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0"><CardContent className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-[220px] flex-1"><Select label="Loja" value={branchId} options={branchOptions} onChange={(event) => setBranchId(event.target.value)} /></div><Badge>{cash ? "Caixa aberto" : "Caixa fechado"}</Badge></div>
        {!cash ? <form className="grid gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => void openCash(event)}><Input name="openingAmount" label="Fundo de troco" type="number" step="0.01" defaultValue="0" /><Button type="submit">Abrir caixa</Button></form> : <Input ref={scannerRef} label="Leitor de código de barras · F2" value={scanner} placeholder="Leia o código e pressione Enter" onChange={(event) => setScanner(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); scan(); } }} />}
        <div className="grid gap-2">{cart.length ? cart.map((item) => <div key={item.productId} className="grid gap-2 rounded-md border border-[var(--brand-border)] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.unitPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div><div className="flex items-center gap-1"><Button variant="secondary" className="h-8 w-8 px-0" onClick={() => setCart((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity: Math.max(1, row.quantity - 1) } : row))}><Minus size={14} /></Button><span className="w-8 text-center">{item.quantity}</span><Button variant="secondary" className="h-8 w-8 px-0" onClick={() => setCart((current) => current.map((row) => row.productId === item.productId ? { ...row, quantity: row.quantity + 1 } : row))}><Plus size={14} /></Button></div><Button variant="ghost" className="h-8 w-8 px-0" onClick={() => setCart((current) => current.filter((row) => row.productId !== item.productId))}><X size={15} /></Button></div>) : <div className="grid place-items-center gap-2 rounded-md border border-dashed border-[var(--brand-border)] py-16 text-center text-slate-500"><ScanBarcode size={28} /><p>Abra o caixa e leia o primeiro produto.</p></div>}</div>
      </CardContent></Card>
      <Card variant="brand" className="h-fit"><CardContent className="grid gap-5"><div><p className="text-xs uppercase tracking-[0.18em] text-white/70">Total da venda</p><p className="mt-2 text-4xl font-semibold text-white">{total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div><div className="grid grid-cols-3 gap-2"><PaymentButton active={paymentMethod === "cash"} label="Dinheiro F4" icon={<Banknote size={18} />} onClick={() => setPaymentMethod("cash")} /><PaymentButton active={paymentMethod === "pix"} label="Pix F6" icon={<WalletCards size={18} />} onClick={() => setPaymentMethod("pix")} /><PaymentButton active={paymentMethod === "card"} label="Cartão F8" icon={<CreditCard size={18} />} onClick={() => setPaymentMethod("card")} /></div><Button className="w-full bg-[var(--brand-accent)] text-[var(--brand-primary)] hover:brightness-95" disabled={!cash || !cart.length} onClick={() => void finishSale()}>Concluir venda</Button><p className="text-xs leading-5 text-white/65">Descontos acima de 10% são recusados pela API quando o operador não possui permissão gerencial.</p></CardContent></Card>
    </div>
  </div>;
}

function PaymentButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) { return <button type="button" className={`grid min-h-20 place-items-center gap-1 rounded-md border p-2 text-xs ${active ? "border-[var(--brand-accent)] bg-white text-[var(--brand-primary)]" : "border-white/15 bg-white/5 text-white"}`} onClick={onClick}>{icon}<span>{label}</span></button>; }
