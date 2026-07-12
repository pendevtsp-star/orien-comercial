export interface TenantBranding {
  companyName: string;
  tradingName?: string;
  documentId?: string;
  primaryColor: string;
  accentColor: string;
  supportEmail?: string;
  supportPhone?: string;
  website?: string;
  logoUrl?: string;
  footerNote?: string;
}

export interface DocumentMetric {
  label: string;
  value: string;
}

export interface DocumentRow {
  [key: string]: string | number | null | undefined;
}

export interface DocumentSection {
  title: string;
  subtitle?: string;
  contentHtml?: string;
  metrics?: DocumentMetric[];
  table?: {
    columns: Array<{ key: string; label: string }>;
    rows: DocumentRow[];
  };
}

export interface DocumentRenderInput {
  title: string;
  subtitle?: string;
  badge?: string;
  branding: TenantBranding;
  meta?: Array<{ label: string; value: string }>;
  sections: DocumentSection[];
}

export interface EmailRenderInput {
  subject: string;
  previewText: string;
  branding: TenantBranding;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  outro?: string;
}

export const defaultTenantBranding: TenantBranding = {
  companyName: "Orien",
  primaryColor: "#0B1D3D",
  accentColor: "#F5C34A",
  website: "useorien.com.br",
  footerNote: "Documento gerado automaticamente pela Orien.",
};

export function resolveBranding(input?: Partial<TenantBranding> | null): TenantBranding {
  return {
    ...defaultTenantBranding,
    ...input,
    companyName: input?.companyName?.trim() || defaultTenantBranding.companyName,
    primaryColor: normalizeHex(input?.primaryColor, defaultTenantBranding.primaryColor),
    accentColor: normalizeHex(input?.accentColor, defaultTenantBranding.accentColor),
  };
}

export function renderDocumentHtml(input: DocumentRenderInput): string {
  const branding = resolveBranding(input.branding);
  const metaHtml = (input.meta ?? [])
    .map(
      (item) =>
        `<div class="meta-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`,
    )
    .join("");
  const sectionHtml = input.sections.map((section) => renderSection(section)).join("");

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      ${baseStyles(branding)}
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <div>
          <p class="eyebrow">${escapeHtml(branding.tradingName || branding.companyName)}</p>
          <h1>${escapeHtml(input.title)}</h1>
          ${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ""}
        </div>
        <div class="brand-mark">
          ${branding.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" alt="Logo ${escapeHtml(branding.companyName)}" />` : `<span>${escapeHtml(input.badge || "Documento oficial")}</span>`}
        </div>
      </header>
      <section class="brand-strip">
        <div>
          <strong>${escapeHtml(branding.companyName)}</strong>
          ${branding.documentId ? `<span>Documento ${escapeHtml(branding.documentId)}</span>` : ""}
        </div>
        <div>
          ${branding.supportEmail ? `<span>${escapeHtml(branding.supportEmail)}</span>` : ""}
          ${branding.supportPhone ? `<span>${escapeHtml(branding.supportPhone)}</span>` : ""}
          ${branding.website ? `<span>${escapeHtml(branding.website)}</span>` : ""}
        </div>
      </section>
      ${metaHtml ? `<section class="meta-grid">${metaHtml}</section>` : ""}
      ${sectionHtml}
      <footer class="footer">
        <p>${escapeHtml(branding.footerNote || defaultTenantBranding.footerNote || "")}</p>
      </footer>
    </main>
  </body>
</html>`;
}

export function renderEmailHtml(input: EmailRenderInput): string {
  const branding = resolveBranding(input.branding);
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.subject)}</title>
    <style>${baseStyles(branding)}</style>
  </head>
  <body>
    <main class="page email">
      <div class="preview">${escapeHtml(input.previewText)}</div>
      <header class="hero compact">
        <div>
          <p class="eyebrow">${escapeHtml(branding.tradingName || branding.companyName)}</p>
          <h1>${escapeHtml(input.heading)}</h1>
          <p class="subtitle">${escapeHtml(input.intro)}</p>
        </div>
      </header>
      <section class="section">
        <div class="rich-text">${input.bodyHtml}</div>
        ${input.ctaLabel && input.ctaUrl ? `<p><a class="cta" href="${escapeHtml(input.ctaUrl)}">${escapeHtml(input.ctaLabel)}</a></p>` : ""}
        ${input.outro ? `<p class="muted">${escapeHtml(input.outro)}</p>` : ""}
      </section>
      <footer class="footer">
        <p>${escapeHtml(branding.footerNote || defaultTenantBranding.footerNote || "")}</p>
      </footer>
    </main>
  </body>
</html>`;
}

function renderSection(section: DocumentSection): string {
  const metricsHtml = section.metrics?.length
    ? `<div class="metric-grid">${section.metrics
        .map(
          (metric) =>
            `<div class="metric-card"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong></div>`,
        )
        .join("")}</div>`
    : "";
  const tableHtml = section.table ? renderTable(section.table.columns, section.table.rows) : "";
  return `<section class="section">
    <div class="section-head">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.subtitle ? `<p>${escapeHtml(section.subtitle)}</p>` : ""}
    </div>
    ${metricsHtml}
    ${section.contentHtml ?? ""}
    ${tableHtml}
  </section>`;
}

function renderTable(columns: Array<{ key: string; label: string }>, rows: DocumentRow[]): string {
  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((column) => `<td>${escapeHtml(String(row[column.key] ?? "-"))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function baseStyles(branding: TenantBranding): string {
  return `
    :root {
      --ink: #0b1d3d;
      --muted: #4a5977;
      --line: #d9e1ee;
      --panel: #ffffff;
      --surface: #f5f7fb;
      --primary: ${branding.primaryColor};
      --accent: ${branding.accentColor};
      --secondary: #133a7c;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--surface); color: var(--ink); font-family: Inter, Arial, sans-serif; }
    .page { max-width: 1040px; margin: 0 auto; padding: 40px 24px 48px; }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 32px;
      border-radius: 20px;
      background:
        radial-gradient(circle at top right, rgba(245,195,74,0.22), transparent 28%),
        linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      box-shadow: 0 28px 60px rgba(11,29,61,0.16);
    }
    .hero.compact { padding: 28px; }
    .hero h1 { margin: 10px 0 0; font-size: 34px; line-height: 1.08; font-family: "Playfair Display", Georgia, serif; font-weight: 600; }
    .subtitle { margin: 10px 0 0; max-width: 620px; color: rgba(255,255,255,0.84); }
    .eyebrow { margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.72); }
    .brand-mark { display: flex; align-items: flex-start; }
    .brand-mark span {
      padding: 12px 16px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.1);
      font-size: 13px;
      font-weight: 600;
    }
    .brand-mark img { max-width: 140px; max-height: 56px; border-radius: 10px; background: white; object-fit: contain; padding: 6px; }
    .brand-strip, .meta-grid, .metric-grid { display: grid; gap: 16px; }
    .brand-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 16px;
      padding: 18px 22px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,1), rgba(241,243,246,0.72));
    }
    .brand-strip div { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
    .brand-strip span { color: var(--muted); font-size: 14px; }
    .meta-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 18px; }
    .meta-card, .metric-card {
      padding: 16px 18px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: 0 10px 30px rgba(11,29,61,0.04);
    }
    .meta-card span, .metric-card span { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 8px; }
    .meta-card strong, .metric-card strong { font-size: 18px; }
    .section {
      margin-top: 18px;
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: var(--panel);
      box-shadow: 0 14px 34px rgba(11,29,61,0.05);
    }
    .section-head h2 { margin: 0; font-size: 20px; font-family: "Playfair Display", Georgia, serif; font-weight: 600; }
    .section-head p, .muted, .rich-text p { color: var(--muted); }
    .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; }
    .table-wrap { overflow: hidden; border: 1px solid var(--line); border-radius: 16px; margin-top: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead { background: #f1f3f6; }
    th, td { padding: 12px 14px; border-bottom: 1px solid var(--line); text-align: left; }
    .footer { margin-top: 20px; padding-top: 12px; color: var(--muted); font-size: 12px; }
    .cta {
      display: inline-block;
      padding: 12px 16px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      text-decoration: none;
      font-weight: 600;
    }
    .preview { display: none; max-height: 0; opacity: 0; overflow: hidden; }
    @media (max-width: 768px) {
      .hero, .brand-strip { grid-template-columns: 1fr; display: grid; }
      .meta-grid, .metric-grid { grid-template-columns: 1fr; }
    }
  `;
}

function normalizeHex(input: string | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(input ?? "") ? (input as string) : fallback;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
