"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "Não foi possível concluir a operação.");
  return body;
}

const labels: Record<string, string> = {
  pending: "Aguardando envio",
  submitted: "Aguardando aprovação",
  approved: "Publicado",
  rejected: "Recusado",
  revoked: "Revogado",
};

export default function TestimonialsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [tenantResult, requestResult] = await Promise.all([
      call("/platform/tenants"),
      call("/platform/testimonials"),
    ]);
    setTenants(tenantResult.data ?? []);
    setRequests(requestResult.data ?? []);
  }
  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Não foi possível carregar os depoimentos.",
      ),
    );
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await call("/platform/testimonials", {
        method: "POST",
        body: JSON.stringify({
          tenantId: tenantId || undefined,
          recipientEmail: recipientEmail || undefined,
        }),
      });
      setRecipientEmail("");
      setNotice(`Convite criado. Link: ${result.publicUrl}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o convite.");
    }
  }
  async function decide(id: string, action: "approve" | "reject" | "revoke") {
    try {
      await call(`/platform/testimonials/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === "approve"
          ? "Depoimento aprovado e publicado."
          : action === "revoke"
            ? "Publicação revogada."
            : "Depoimento recusado.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o depoimento.");
    }
  }
  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setNotice("Link copiado.");
  }
  return (
    <main className="main">
      <Link className="text-button" href="/">
        ← Central
      </Link>
      <p className="eyebrow">PROVA SOCIAL</p>
      <h1>Depoimentos autorizados</h1>
      <p className="muted">
        Envie um convite, receba o consentimento e publique somente após a sua aprovação.
      </p>
      {error && (
        <p className="feedback error">
          <span>{error}</span>
          <button aria-label="Fechar" onClick={() => setError("")}>
            ×
          </button>
        </p>
      )}
      {notice && (
        <p className="feedback success">
          <span>{notice}</span>
          <button aria-label="Fechar" onClick={() => setNotice("")}>
            ×
          </button>
        </p>
      )}
      <section className="panel" style={{ marginTop: 24 }}>
        <p className="eyebrow">NOVO CONVITE</p>
        <h2>Solicitar avaliação</h2>
        <form className="testimonial-form" onSubmit={create}>
          <label>
            Empresa vinculada
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              <option value="">Sem vínculo com tenant</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            E-mail do destinatário{" "}
            <input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              placeholder="Opcional, para registro"
            />
          </label>
          <button className="btn primary">Gerar link de avaliação</button>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">MODERAÇÃO</p>
            <h2>Convites e avaliações</h2>
          </div>
          <span className="muted">{requests.length} registro(s)</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Destinatário</th>
                <th>Status</th>
                <th>Relato</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    Nenhum convite criado ainda.
                  </td>
                </tr>
              )}
              {requests.map((request) => (
                <tr key={request.id}>
                  <td>
                    <strong>{request.tenantName ?? request.company ?? "Sem empresa"}</strong>
                    <br />
                    <small>{request.recipientEmail ?? "Link sem e-mail associado"}</small>
                  </td>
                  <td>
                    {request.name ? (
                      <>
                        <strong>{request.name}</strong>
                        <br />
                        <small>{[request.role, request.company].filter(Boolean).join(" · ")}</small>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    <span className="pill">{labels[request.status] ?? request.status}</span>
                  </td>
                  <td className="testimonial-quote">{request.quote ?? "Ainda não enviado"}</td>
                  <td>
                    <div className="inline-actions">
                      <button className="btn small" onClick={() => void copy(request.publicUrl)}>
                        Copiar link
                      </button>
                      {request.status === "submitted" && (
                        <>
                          <button
                            className="btn small primary"
                            onClick={() => void decide(request.id, "approve")}
                          >
                            Aprovar
                          </button>
                          <button
                            className="btn small"
                            onClick={() => void decide(request.id, "reject")}
                          >
                            Recusar
                          </button>
                        </>
                      )}
                      {request.status === "approved" && (
                        <button
                          className="btn small danger"
                          onClick={() => void decide(request.id, "revoke")}
                        >
                          Revogar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
