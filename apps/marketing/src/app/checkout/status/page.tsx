"use client";

import Link from "next/link";
import { BrandLogo } from "@sgc/ui";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

const content = { confirmed: { title: "Pagamento confirmado", text: "Sua contratação foi confirmada. Você receberá as próximas instruções no e-mail informado.", Icon: CheckCircle2, color: "text-emerald-600" }, cancelled: { title: "Checkout cancelado", text: "Nenhuma cobrança foi concluída. Você pode retornar quando estiver pronto.", Icon: XCircle, color: "text-rose-600" }, expired: { title: "Checkout expirado", text: "O tempo para concluir o pagamento terminou. Inicie uma nova contratação para continuar.", Icon: Clock3, color: "text-amber-600" }, pending: { title: "Aguardando pagamento", text: "Ainda estamos aguardando a confirmação do pagamento. Atualizaremos seu acesso assim que o provedor confirmar.", Icon: Clock3, color: "text-[#2563eb]" } };

export default function CheckoutStatusPage() { const query = useSearchParams(); const status = (query.get("status") ?? "pending") as keyof typeof content; const item = content[status] ?? content.pending; const Icon = item.Icon; return <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-5 text-[#0b1d3d]"><section className="w-full max-w-xl rounded-2xl border border-[#d9e1ee] bg-white p-8 text-center shadow-sm"><BrandLogo size="sm" /><Icon className={`mx-auto mt-10 ${item.color}`} size={52}/><h1 data-brand-display="true" className="mt-5 text-4xl">{item.title}</h1><p className="mx-auto mt-4 max-w-md leading-7 text-slate-600">{item.text}</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="rounded-lg bg-[#0b1d3d] px-5 py-3 font-semibold text-white" href="/">Voltar para a Orien</Link><Link className="rounded-lg border border-[#cbd7e9] px-5 py-3 font-semibold" href="/checkout">Abrir checkout</Link></div></section></main>; }
