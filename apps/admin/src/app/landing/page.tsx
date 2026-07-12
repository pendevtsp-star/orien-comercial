"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";
async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message ?? "Não foi possível salvar.");
  return b;
}
export default function Landing() {
  const [settings, setSettings] = useState<any>({
      heroCta: "Começar agora",
      supportEmail: "suporte@useorien.com.br",
      whatsappNumber: "",
      whatsappMessage: "Olá, quero conhecer a Orien.",
      showCalculator: true,
      showTestimonials: true,
      showFaq: true,
      showPlans: true,
      showSegments: true,
      testimonials: [],
    }),
    [message, setMessage] = useState("");
  useEffect(() => {
    void call("/platform/landing")
      .then(setSettings)
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      setSettings(
        await call("/platform/landing", { method: "PATCH", body: JSON.stringify(settings) }),
      );
      setMessage("Configurações salvas.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro");
    }
  }
  return (
    <main className="main">
      <Link className="text-button" href="/">
        ← Central
      </Link>
      <p className="eyebrow">MARKETING</p>
      <h1>Configuração da landing</h1>
      <form className="panel" onSubmit={save}>
        <label>
          CTA principal
          <input
            value={settings.heroCta ?? ""}
            onChange={(e) => setSettings({ ...settings, heroCta: e.target.value })}
          />
        </label>
        <label>
          E-mail comercial
          <input
            value={settings.supportEmail ?? ""}
            onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
          />
        </label>
        <label>
          WhatsApp comercial
          <input
            inputMode="tel"
            placeholder="5511999999999"
            value={settings.whatsappNumber ?? ""}
            onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value.replace(/\D/g, "") })}
          />
        </label>
        <label>
          Mensagem inicial do WhatsApp
          <textarea
            value={settings.whatsappMessage ?? ""}
            onChange={(e) => setSettings({ ...settings, whatsappMessage: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!settings.showCalculator}
            onChange={(e) => setSettings({ ...settings, showCalculator: e.target.checked })}
          />
          <span>
            <strong>Exibir calculadora</strong>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!settings.showPlans} onChange={(e) => setSettings({ ...settings, showPlans: e.target.checked })} />
          <span><strong>Exibir planos</strong></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!settings.showSegments} onChange={(e) => setSettings({ ...settings, showSegments: e.target.checked })} />
          <span><strong>Exibir segmentos atendidos</strong></span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!settings.showFaq} onChange={(e) => setSettings({ ...settings, showFaq: e.target.checked })} />
          <span><strong>Exibir perguntas frequentes</strong></span>
        </label>
        <label>
          Depoimentos autorizados
          <textarea
            key={JSON.stringify(settings.testimonials ?? [])}
            defaultValue={JSON.stringify(settings.testimonials ?? [], null, 2)}
            placeholder={'[{"name":"Nome","company":"Empresa","role":"Cargo","quote":"Depoimento autorizado","imageUrl":"https://..."}]'}
            onBlur={(e) => {
              try {
                const testimonials = JSON.parse(e.target.value);
                if (!Array.isArray(testimonials)) throw new Error();
                setSettings({ ...settings, testimonials });
                setMessage("");
              } catch { setMessage("O campo de depoimentos deve conter uma lista JSON válida."); }
            }}
          />
          <small>Publique apenas avaliações autorizadas. Nome e depoimento são obrigatórios.</small>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={!!settings.showTestimonials}
            onChange={(e) => setSettings({ ...settings, showTestimonials: e.target.checked })}
          />
          <span>
            <strong>Exibir depoimentos</strong>
          </span>
        </label>
        <button className="btn primary">Salvar landing</button>
        {message && <p className="feedback success">{message}</p>}
      </form>
    </main>
  );
}
