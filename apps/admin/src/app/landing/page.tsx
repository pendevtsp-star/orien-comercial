"use client";

import Link from "next/link";
import {
  ExternalLink,
  History,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";
const marketingBaseUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://useorien.com.br";
const tabs = [
  { id: "general", label: "Geral" },
  { id: "product", label: "Produto" },
  { id: "plans", label: "Planos" },
  { id: "social-proof", label: "Prova social" },
  { id: "sections-footer", label: "Seções e rodapé" },
  { id: "history", label: "Histórico" },
] as const;

type Tab = (typeof tabs)[number]["id"];
type Cta = { label: string; href: string };
type PlanName = "starter" | "pro" | "enterprise";
type FieldErrors = Record<string, string>;

type ShowcaseSlide = {
  eyebrow: string;
  title: string;
  description: string;
  alt: string;
  imageUrl: string;
  href: string;
  isVisible: boolean;
};

type Testimonial = {
  testimonialRequestId: string;
  name: string;
  company: string;
  role: string;
  quote: string;
  imageUrl: string;
};

type LandingSettings = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    trialText: string;
    primaryCta: Cta;
    secondaryCta: Cta | null;
  };
  visibility: {
    showCalculator: boolean;
    showTestimonials: boolean;
    showFaq: boolean;
    showPlans: boolean;
    showSegments: boolean;
    showProduct: boolean;
    showMigration: boolean;
    showSecurity: boolean;
  };
  supportEmail: string;
  whatsappNumber: string;
  whatsappMessage: string;
  showcaseSlides: ShowcaseSlide[];
  planPresentation: {
    highlightedPlan: PlanName;
    ctaLabels: Record<PlanName, string>;
  };
  socialProof: { title: string };
  finalCta: Cta;
  footerLinks: Cta[];
  testimonials: Testimonial[];
  admin: {
    internalNotes: string;
    updatedBy: string;
  };
};

type LandingRevision = {
  id: string;
  value: LandingSettings;
  publishedBy: string | null;
  publishedAt: string;
  restoredFromId: string | null;
};

type PublishedLandingRevision = Omit<LandingRevision, "publishedBy">;

const landingLimits = {
  heroEyebrow: 90,
  heroTitle: 150,
  heroDescription: 320,
  heroTrialText: 140,
  ctaLabel: 80,
  supportEmail: 254,
  whatsappNumber: 32,
  whatsappMessage: 400,
  slideAlt: 160,
  socialProofTitle: 140,
  testimonialName: 100,
  testimonialCompany: 120,
  testimonialRole: 100,
  testimonialQuote: 700,
  url: 500,
  slides: 4,
  footerLinks: 4,
  testimonials: 8,
  adminInternalNotes: 1_000,
  adminUpdatedBy: 100,
} as const;

const landingSettingKeys = [
  "hero",
  "visibility",
  "supportEmail",
  "whatsappNumber",
  "whatsappMessage",
  "showcaseSlides",
  "planPresentation",
  "socialProof",
  "finalCta",
  "footerLinks",
  "testimonials",
  "admin",
] as const;

const initialSettings: LandingSettings = {
  hero: {
    eyebrow: "Gestão comercial",
    title: "Gestão clara para vender melhor",
    description: "Teste por 7 dias sem cartão e mantenha o seu comercial sob controle.",
    trialText: "Teste por 7 dias sem cartão.",
    primaryCta: { label: "Começar teste gratuito", href: "/checkout?plan=pro" },
    secondaryCta: { label: "Falar com especialista", href: "/contato" },
  },
  visibility: {
    showCalculator: true,
    showTestimonials: true,
    showFaq: true,
    showPlans: true,
    showSegments: true,
    showProduct: true,
    showMigration: true,
    showSecurity: true,
  },
  supportEmail: "",
  whatsappNumber: "",
  whatsappMessage: "Olá, quero conhecer a plataforma.",
  showcaseSlides: [],
  planPresentation: {
    highlightedPlan: "pro",
    ctaLabels: {
      starter: "Começar agora",
      pro: "Começar agora",
      enterprise: "Falar com especialista",
    },
  },
  socialProof: { title: "Histórias de quem organiza melhor a operação" },
  finalCta: { label: "Começar teste gratuito", href: "/checkout?plan=pro" },
  footerLinks: [],
  testimonials: [],
  admin: { internalNotes: "", updatedBy: "" },
};

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body: unknown = await response.json().catch(() => ({}));

  if (!response.ok) throw new Error("Não foi possível concluir a operação.");
  return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function isTrimmedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length <= maxLength;
}

function isSafeCopy(value: unknown, maxLength: number): value is string {
  return isTrimmedString(value, maxLength) && value.length > 0 && !/[<>{}]/.test(value);
}

function isSafeOptionalCopy(value: unknown, maxLength: number): value is string {
  return isTrimmedString(value, maxLength) && !/[<>{}]/.test(value);
}

const supportEmailSchema = z.string().email().max(254);

function isOptionalSupportEmail(value: string) {
  return value === "" || supportEmailSchema.safeParse(value).success;
}

function isCta(value: unknown): value is Cta {
  return (
    isExactRecord(value, ["label", "href"]) &&
    isSafeCopy(value.label, landingLimits.ctaLabel) &&
    typeof value.href === "string" &&
    isAllowedHref(value.href)
  );
}

function isShowcaseSlide(value: unknown): value is ShowcaseSlide {
  return (
    isExactRecord(value, [
      "eyebrow",
      "title",
      "description",
      "alt",
      "imageUrl",
      "href",
      "isVisible",
    ]) &&
    isSafeOptionalCopy(value.eyebrow, landingLimits.heroEyebrow) &&
    isSafeCopy(value.title, landingLimits.heroTitle) &&
    isSafeCopy(value.description, landingLimits.heroDescription) &&
    isSafeCopy(value.alt, landingLimits.slideAlt) &&
    isOptionalShowcaseImageUrl(value.imageUrl) &&
    isOptionalHref(value.href) &&
    typeof value.isVisible === "boolean"
  );
}

function isTestimonial(value: unknown): value is Testimonial {
  return (
    isExactRecord(value, [
      "testimonialRequestId",
      "name",
      "company",
      "role",
      "quote",
      "imageUrl",
    ]) &&
    isSafeOptionalCopy(value.testimonialRequestId, landingLimits.ctaLabel) &&
    isSafeCopy(value.name, landingLimits.testimonialName) &&
    isSafeOptionalCopy(value.company, landingLimits.testimonialCompany) &&
    isSafeOptionalCopy(value.role, landingLimits.testimonialRole) &&
    isSafeCopy(value.quote, landingLimits.testimonialQuote) &&
    isOptionalImageUrl(value.imageUrl)
  );
}

function isLandingSettings(value: unknown): value is LandingSettings {
  if (
    !isExactRecord(value, landingSettingKeys) ||
    !isExactRecord(value.hero, [
      "eyebrow",
      "title",
      "description",
      "trialText",
      "primaryCta",
      "secondaryCta",
    ]) ||
    !isExactRecord(value.visibility, [
      "showCalculator",
      "showTestimonials",
      "showFaq",
      "showPlans",
      "showSegments",
      "showProduct",
      "showMigration",
      "showSecurity",
    ]) ||
    !isExactRecord(value.planPresentation, ["highlightedPlan", "ctaLabels"]) ||
    !isExactRecord(value.planPresentation.ctaLabels, ["starter", "pro", "enterprise"]) ||
    !isExactRecord(value.socialProof, ["title"]) ||
    !isExactRecord(value.admin, ["internalNotes", "updatedBy"])
  )
    return false;

  const { hero, visibility } = value;
  return (
    isSafeCopy(hero.eyebrow, landingLimits.heroEyebrow) &&
    isSafeCopy(hero.title, landingLimits.heroTitle) &&
    isSafeCopy(hero.description, landingLimits.heroDescription) &&
    isSafeCopy(hero.trialText, landingLimits.heroTrialText) &&
    isCta(hero.primaryCta) &&
    (hero.secondaryCta === null || isCta(hero.secondaryCta)) &&
    typeof visibility.showCalculator === "boolean" &&
    typeof visibility.showTestimonials === "boolean" &&
    typeof visibility.showFaq === "boolean" &&
    typeof visibility.showPlans === "boolean" &&
    typeof visibility.showSegments === "boolean" &&
    typeof visibility.showProduct === "boolean" &&
    typeof visibility.showMigration === "boolean" &&
    typeof visibility.showSecurity === "boolean" &&
    typeof value.supportEmail === "string" &&
    isOptionalSupportEmail(value.supportEmail) &&
    isTrimmedString(value.whatsappNumber, landingLimits.whatsappNumber) &&
    isSafeCopy(value.whatsappMessage, landingLimits.whatsappMessage) &&
    Array.isArray(value.showcaseSlides) &&
    value.showcaseSlides.length <= landingLimits.slides &&
    value.showcaseSlides.every(isShowcaseSlide) &&
    (value.planPresentation.highlightedPlan === "starter" ||
      value.planPresentation.highlightedPlan === "pro" ||
      value.planPresentation.highlightedPlan === "enterprise") &&
    isSafeCopy(value.planPresentation.ctaLabels.starter, landingLimits.ctaLabel) &&
    isSafeCopy(value.planPresentation.ctaLabels.pro, landingLimits.ctaLabel) &&
    isSafeCopy(value.planPresentation.ctaLabels.enterprise, landingLimits.ctaLabel) &&
    isSafeCopy(value.socialProof.title, landingLimits.socialProofTitle) &&
    isCta(value.finalCta) &&
    Array.isArray(value.footerLinks) &&
    value.footerLinks.length <= landingLimits.footerLinks &&
    value.footerLinks.every(isCta) &&
    Array.isArray(value.testimonials) &&
    value.testimonials.length <= landingLimits.testimonials &&
    value.testimonials.every(isTestimonial) &&
    isTrimmedString(value.admin.internalNotes, landingLimits.adminInternalNotes) &&
    isTrimmedString(value.admin.updatedBy, landingLimits.adminUpdatedBy)
  );
}

function isLandingRevision(value: unknown): value is LandingRevision {
  return (
    isExactRecord(value, ["id", "value", "publishedBy", "publishedAt", "restoredFromId"]) &&
    typeof value.id === "string" &&
    typeof value.publishedAt === "string" &&
    (typeof value.publishedBy === "string" || value.publishedBy === null) &&
    (typeof value.restoredFromId === "string" || value.restoredFromId === null) &&
    isLandingSettings(value.value)
  );
}

function isPublishedRevision(value: unknown): value is PublishedLandingRevision {
  return (
    isExactRecord(value, ["id", "value", "publishedAt", "restoredFromId"]) &&
    typeof value.id === "string" &&
    typeof value.publishedAt === "string" &&
    (typeof value.restoredFromId === "string" || value.restoredFromId === null) &&
    isLandingSettings(value.value)
  );
}

function isRevisionsResponse(value: unknown): value is { data: LandingRevision[] } {
  return (
    isExactRecord(value, ["data"]) &&
    Array.isArray(value.data) &&
    value.data.every(isLandingRevision)
  );
}

export function isAllowedHref(value: string) {
  if (value !== value.trim()) return false;

  if (/^https:/i.test(value)) {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }

  if (
    !value.startsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("%")
  ) {
    return false;
  }

  try {
    const url = new URL(value, "https://internal.invalid");
    const rawPathname = value.split(/[?#]/, 1)[0];
    return url.origin === "https://internal.invalid" && url.pathname === rawPathname;
  } catch {
    return false;
  }
}

function isOptionalHref(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= landingLimits.url &&
    (value === "" || isAllowedHref(value))
  );
}

function isOptionalShowcaseImageUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= landingLimits.url &&
    (value === "" || isAllowedShowcaseImageUrl(value))
  );
}

function isAllowedShowcaseImageUrl(value: string) {
  return value.startsWith("/product-showcase/") && isAllowedHref(value) || isSafeHttpsUrl(value);
}

function isOptionalImageUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= landingLimits.url &&
    (value === "" || isSafeHttpsUrl(value))
  );
}

function isSafeHttpsUrl(value: string) {
  if (value !== value.trim()) return false;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validationErrors(settings: LandingSettings): FieldErrors {
  const errors: FieldErrors = {};
  const requiredCopy = (key: string, value: string, maxLength: number) => {
    if (!isSafeCopy(value, maxLength))
      errors[key] = `Use de 1 a ${maxLength} caracteres, sem marcação ou espaços nas pontas.`;
  };
  const href = (key: string, value: string) => {
    if (!isAllowedHref(value)) errors[key] = "Use um caminho interno seguro ou uma URL HTTPS.";
  };
  const optionalCopy = (key: string, value: string, maxLength: number) => {
    if (!isSafeOptionalCopy(value, maxLength))
      errors[key] = `Use no máximo ${maxLength} caracteres, sem marcação ou espaços nas pontas.`;
  };
  const optionalHref = (key: string, value: string) => {
    if (!isOptionalHref(value))
      errors[key] =
        `Use vazio, caminho interno seguro ou URL HTTPS de até ${landingLimits.url} caracteres.`;
  };

  requiredCopy("hero.eyebrow", settings.hero.eyebrow, landingLimits.heroEyebrow);
  requiredCopy("hero.title", settings.hero.title, landingLimits.heroTitle);
  requiredCopy("hero.description", settings.hero.description, landingLimits.heroDescription);
  requiredCopy("hero.trialText", settings.hero.trialText, landingLimits.heroTrialText);
  requiredCopy("hero.primaryCta.label", settings.hero.primaryCta.label, landingLimits.ctaLabel);
  href("hero.primaryCta.href", settings.hero.primaryCta.href);
  if (settings.hero.secondaryCta) {
    requiredCopy(
      "hero.secondaryCta.label",
      settings.hero.secondaryCta.label,
      landingLimits.ctaLabel,
    );
    href("hero.secondaryCta.href", settings.hero.secondaryCta.href);
  }
  if (!isOptionalSupportEmail(settings.supportEmail))
    errors.supportEmail = "Informe um e-mail válido de até 254 caracteres ou deixe o campo vazio.";
  if (!isTrimmedString(settings.whatsappNumber, landingLimits.whatsappNumber))
    errors.whatsappNumber = "Use até 32 algarismos, sem espaços nas pontas.";
  requiredCopy("whatsappMessage", settings.whatsappMessage, landingLimits.whatsappMessage);
  if (settings.showcaseSlides.length > landingLimits.slides)
    errors.showcaseSlides = `Use no máximo ${landingLimits.slides} slides.`;

  settings.showcaseSlides.forEach((slide, index) => {
    optionalCopy(`slides.${index}.eyebrow`, slide.eyebrow, landingLimits.heroEyebrow);
    requiredCopy(`slides.${index}.title`, slide.title, landingLimits.heroTitle);
    requiredCopy(`slides.${index}.description`, slide.description, landingLimits.heroDescription);
    requiredCopy(`slides.${index}.alt`, slide.alt, landingLimits.slideAlt);
    if (!isOptionalShowcaseImageUrl(slide.imageUrl))
      errors[`slides.${index}.imageUrl`] =
        `Use vazio, um caminho seguro em /product-showcase/ ou uma URL HTTPS de até ${landingLimits.url} caracteres.`;
    optionalHref(`slides.${index}.href`, slide.href);
  });

  if (!["starter", "pro", "enterprise"].includes(settings.planPresentation.highlightedPlan))
    errors["planPresentation.highlightedPlan"] = "Selecione um plano válido.";
  (["starter", "pro", "enterprise"] as PlanName[]).forEach((plan) => {
    requiredCopy(
      `plans.${plan}`,
      settings.planPresentation.ctaLabels[plan],
      landingLimits.ctaLabel,
    );
  });
  requiredCopy("socialProof.title", settings.socialProof.title, landingLimits.socialProofTitle);
  requiredCopy("finalCta.label", settings.finalCta.label, landingLimits.ctaLabel);
  href("finalCta.href", settings.finalCta.href);
  if (settings.footerLinks.length > landingLimits.footerLinks)
    errors.footerLinks = `Use no máximo ${landingLimits.footerLinks} links no rodapé.`;
  settings.footerLinks.forEach((link, index) => {
    requiredCopy(`footerLinks.${index}.label`, link.label, landingLimits.ctaLabel);
    href(`footerLinks.${index}.href`, link.href);
  });
  return errors;
}

function firstInvalidTab(errors: FieldErrors): Tab {
  const key = Object.keys(errors)[0] ?? "";
  if (key.startsWith("slides.")) return "product";
  if (key.startsWith("plans.")) return "plans";
  if (key.startsWith("socialProof.")) return "social-proof";
  if (key.startsWith("finalCta.") || key.startsWith("footerLinks.")) return "sections-footer";
  return "general";
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  return <span className="character-count">{`${value.length}/${max}`}</span>;
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function LoadingButton({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <>
      {loading && <LoaderCircle className="button-icon spinning" aria-hidden="true" />}
      {children}
    </>
  );
}

export default function Landing() {
  const [settings, setSettings] = useState<LandingSettings>(initialSettings);
  const [revisions, setRevisions] = useState<LandingRevision[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [draftState, setDraftState] = useState<"loading" | "ready" | "error">("loading");
  const [draftError, setDraftError] = useState("");
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const markDirty = () => {
    setDirty(true);
    setFieldErrors({});
  };

  const updateSettings = <K extends keyof LandingSettings>(key: K, value: LandingSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const updateHero = <K extends keyof LandingSettings["hero"]>(
    key: K,
    value: LandingSettings["hero"][K],
  ) => {
    setSettings((current) => ({ ...current, hero: { ...current.hero, [key]: value } }));
    markDirty();
  };

  const updateCta = (
    target: "primaryCta" | "secondaryCta" | "finalCta",
    field: keyof Cta,
    value: string,
  ) => {
    setSettings((current) => {
      if (target === "finalCta") {
        return { ...current, finalCta: { ...current.finalCta, [field]: value } };
      }
      if (target === "secondaryCta") {
        return current.hero.secondaryCta
          ? {
              ...current,
              hero: {
                ...current.hero,
                secondaryCta: { ...current.hero.secondaryCta, [field]: value },
              },
            }
          : current;
      }
      return {
        ...current,
        hero: { ...current.hero, primaryCta: { ...current.hero.primaryCta, [field]: value } },
      };
    });
    markDirty();
  };

  const updateVisibility = (key: keyof LandingSettings["visibility"], value: boolean) => {
    setSettings((current) => ({
      ...current,
      visibility: { ...current.visibility, [key]: value },
    }));
    markDirty();
  };

  const updateSlide = <K extends keyof ShowcaseSlide>(
    index: number,
    key: K,
    value: ShowcaseSlide[K],
  ) => {
    setSettings((current) => ({
      ...current,
      showcaseSlides: current.showcaseSlides.map((slide, slideIndex) =>
        slideIndex === index ? { ...slide, [key]: value } : slide,
      ),
    }));
    markDirty();
  };

  const loadDraft = async () => {
    setDraftState("loading");
    try {
      const draft = await call("/platform/landing");
      if (!isLandingSettings(draft)) throw new Error();
      setSettings(draft);
      setDirty(false);
      setDraftError("");
      setDraftState("ready");
      return true;
    } catch {
      setDraftError("Não foi possível carregar o rascunho da landing. Tente novamente.");
      setDraftState("error");
      return false;
    }
  };

  const loadRevisions = async () => {
    setRevisionsLoading(true);
    try {
      const response = await call("/platform/landing/revisions");
      if (!isRevisionsResponse(response)) throw new Error();
      setRevisions(response.data);
      setHistoryError("");
    } catch {
      setHistoryError("Não foi possível carregar o histórico. Tente atualizar novamente.");
    } finally {
      setRevisionsLoading(false);
    }
  };

  useEffect(() => {
    void loadDraft();
    void loadRevisions();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const errors = validationErrors(settings);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setActiveTab(firstInvalidTab(errors));
      setError("Revise os campos destacados antes de salvar o rascunho.");
      setNotice("");
      return;
    }

    setSaving(true);
    try {
      const draft = await call("/platform/landing", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      if (!isLandingSettings(draft)) throw new Error("invalid-response");
      setSettings(draft);
      setDirty(false);
      setNotice("Rascunho salvo.");
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message === "invalid-response"
          ? "O servidor retornou um rascunho inválido. Nenhuma alteração local foi aplicada."
          : "Não foi possível salvar o rascunho.",
      );
      setNotice("");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (saving || dirty || !window.confirm("Publicar as alterações salvas na landing?")) return;

    setPublishing(true);
    try {
      const revision = await call("/platform/landing/publish", { method: "POST" });
      if (!isPublishedRevision(revision)) throw new Error();
      await loadRevisions();
      setNotice("Alterações publicadas.");
      setError("");
    } catch {
      setError("Não foi possível publicar as alterações.");
      setNotice("");
    } finally {
      setPublishing(false);
    }
  }

  async function restore(revision: LandingRevision) {
    if (saving || restoringId) return;
    if (!window.confirm(`Restaurar a versão publicada em ${formatDate(revision.publishedAt)}?`))
      return;

    setRestoringId(revision.id);
    try {
      const restored = await call(`/platform/landing/revisions/${revision.id}/restore`, {
        method: "POST",
      });
      if (!isPublishedRevision(restored)) throw new Error();
      const reloaded = await loadDraft();
      await loadRevisions();
      if (!reloaded) throw new Error();
      setNotice("Versão restaurada no rascunho e publicada como uma nova revisão.");
      setError("");
    } catch {
      setError("Não foi possível restaurar esta versão.");
      setNotice("");
    } finally {
      setRestoringId(null);
    }
  }

  function addSlide() {
    if (settings.showcaseSlides.length >= landingLimits.slides) return;
    updateSettings("showcaseSlides", [
      ...settings.showcaseSlides,
      {
        eyebrow: "Produto",
        title: "Novo destaque",
        description: "Descreva este recurso da plataforma.",
        alt: "Novo destaque da plataforma",
        imageUrl: "",
        href: "",
        isVisible: true,
      },
    ]);
  }

  function addFooterLink() {
    if (settings.footerLinks.length >= landingLimits.footerLinks) return;
    updateSettings("footerLinks", [...settings.footerLinks, { label: "Novo link", href: "/" }]);
  }

  function activateTab(index: number) {
    const tab = tabs[index];
    if (!tab) return;
    setActiveTab(tab.id);
    tabRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    activateTab(nextIndex);
  }

  if (draftState === "loading") {
    return (
      <main className="main landing-page">
        <section className="landing-loading" aria-live="polite">
          <LoaderCircle className="spinning" aria-hidden="true" />
          Carregando rascunho da landing...
        </section>
      </main>
    );
  }

  if (draftState === "error") {
    return (
      <main className="main landing-page">
        <section className="panel landing-blocked" role="alert">
          <h1>Editor indisponível</h1>
          <p>{draftError}</p>
          <button className="btn primary" type="button" onClick={() => void loadDraft()}>
            Tentar carregar novamente
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="main landing-page">
      <div className="landing-top">
        <div>
          <Link className="text-button" href="/">
            ← Central
          </Link>
          <p className="eyebrow">MARKETING</p>
          <h1>Configuração da landing</h1>
          <p className="muted">Edite o rascunho, publique somente quando estiver pronto.</p>
        </div>
        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => window.open(marketingBaseUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="button-icon" aria-hidden="true" />
            Visualizar
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => void publish()}
            disabled={publishing || saving || dirty}
          >
            <Send className="button-icon" aria-hidden="true" />
            <LoadingButton loading={publishing}>Publicar alterações</LoadingButton>
          </button>
          <button className="btn primary" type="submit" form="landing-settings" disabled={saving}>
            <Save className="button-icon" aria-hidden="true" />
            <LoadingButton loading={saving}>
              {saving ? "Salvando rascunho..." : "Salvar rascunho"}
            </LoadingButton>
          </button>
        </div>
      </div>

      {dirty && (
        <p className="landing-status">Salve o rascunho antes de publicar as alterações locais.</p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="feedback success" role="status">
          {notice}
        </p>
      )}

      <form
        id="landing-settings"
        className="landing-editor"
        onSubmit={(event) => void save(event)}
        aria-busy={saving}
      >
        <div className="landing-tabs" role="tablist" aria-label="Seções da configuração da landing">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              className={activeTab === tab.id ? "landing-tab active" : "landing-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <fieldset className="landing-editor-fields" disabled={saving}>
          <section
            className="panel landing-tab-panel"
            id="panel-general"
            role="tabpanel"
            aria-labelledby="tab-general"
            hidden={activeTab !== "general"}
          >
            <p className="eyebrow">HERO E CONTATO</p>
            <h2>Primeira impressão</h2>
            <div className="landing-fields">
              <TextField
                label="Sobretítulo"
                value={settings.hero.eyebrow}
                max={landingLimits.heroEyebrow}
                error={fieldErrors["hero.eyebrow"]}
                onChange={(value) => updateHero("eyebrow", value)}
              />
              <TextField
                label="Título"
                value={settings.hero.title}
                max={landingLimits.heroTitle}
                error={fieldErrors["hero.title"]}
                onChange={(value) => updateHero("title", value)}
              />
              <TextAreaField
                className="landing-full-width"
                label="Descrição"
                value={settings.hero.description}
                max={landingLimits.heroDescription}
                error={fieldErrors["hero.description"]}
                onChange={(value) => updateHero("description", value)}
              />
              <TextField
                label="Texto do teste"
                value={settings.hero.trialText}
                max={landingLimits.heroTrialText}
                error={fieldErrors["hero.trialText"]}
                onChange={(value) => updateHero("trialText", value)}
              />
              <label>
                E-mail de suporte público
                <input
                  maxLength={landingLimits.supportEmail}
                  value={settings.supportEmail}
                  onChange={(event) => updateSettings("supportEmail", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.supportEmail)}
                />
                <FieldError message={fieldErrors.supportEmail} />
              </label>
              <CtaFields
                title="CTA principal"
                cta={settings.hero.primaryCta}
                errors={fieldErrors}
                errorPrefix="hero.primaryCta"
                onChange={(field, value) => updateCta("primaryCta", field, value)}
              />
              <VisibilityToggle
                checked={settings.hero.secondaryCta !== null}
                label="Exibir CTA secundária"
                description="Mostra uma ação complementar ao lado da CTA principal."
                onChange={(value) =>
                  updateHero(
                    "secondaryCta",
                    value ? { label: "Falar com especialista", href: "/contato" } : null,
                  )
                }
              />
              {settings.hero.secondaryCta ? (
                <CtaFields
                  title="CTA secundária"
                  cta={settings.hero.secondaryCta}
                  errors={fieldErrors}
                  errorPrefix="hero.secondaryCta"
                  onChange={(field, value) => updateCta("secondaryCta", field, value)}
                />
              ) : null}
              <label>
                WhatsApp comercial
                <input
                  inputMode="tel"
                  maxLength={landingLimits.whatsappNumber}
                  placeholder="5511999999999"
                  value={settings.whatsappNumber}
                  onChange={(event) =>
                    updateSettings("whatsappNumber", event.target.value.replace(/\D/g, ""))
                  }
                  aria-invalid={Boolean(fieldErrors.whatsappNumber)}
                />
                <FieldError message={fieldErrors.whatsappNumber} />
              </label>
              <TextAreaField
                className="landing-full-width"
                label="Mensagem inicial do WhatsApp"
                value={settings.whatsappMessage}
                max={landingLimits.whatsappMessage}
                error={fieldErrors.whatsappMessage}
                onChange={(value) => updateSettings("whatsappMessage", value)}
              />
            </div>
          </section>

          <section
            className="panel landing-tab-panel"
            id="panel-product"
            role="tabpanel"
            aria-labelledby="tab-product"
            hidden={activeTab !== "product"}
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">VITRINE</p>
                <h2>Slides do produto</h2>
              </div>
              <button
                className="btn"
                type="button"
                onClick={addSlide}
                disabled={settings.showcaseSlides.length >= landingLimits.slides}
              >
                <Plus className="button-icon" aria-hidden="true" />
                Adicionar slide
              </button>
            </div>
            <FieldError message={fieldErrors.showcaseSlides} />
            <div className="landing-slides">
              {settings.showcaseSlides.length === 0 && (
                <p className="empty">Nenhum slide cadastrado.</p>
              )}
              {settings.showcaseSlides.map((slide, index) => (
                <article className="landing-slide" key={`${slide.title}-${index}`}>
                  <div className="landing-slide-heading">
                    <strong>Slide {index + 1}</strong>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remover slide ${index + 1}`}
                      title="Remover slide"
                      onClick={() =>
                        updateSettings(
                          "showcaseSlides",
                          settings.showcaseSlides.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                  <VisibilityToggle
                    checked={slide.isVisible}
                    label="Exibir este slide"
                    description="Mantém o conteúdo no rascunho sem publicá-lo na vitrine."
                    onChange={(value) => updateSlide(index, "isVisible", value)}
                  />
                  <TextField
                    label="Sobretítulo"
                    value={slide.eyebrow}
                    max={landingLimits.heroEyebrow}
                    error={fieldErrors[`slides.${index}.eyebrow`]}
                    onChange={(value) => updateSlide(index, "eyebrow", value)}
                  />
                  <TextField
                    label="Título"
                    value={slide.title}
                    max={landingLimits.heroTitle}
                    error={fieldErrors[`slides.${index}.title`]}
                    onChange={(value) => updateSlide(index, "title", value)}
                  />
                  <TextAreaField
                    label="Descrição"
                    value={slide.description}
                    max={landingLimits.heroDescription}
                    error={fieldErrors[`slides.${index}.description`]}
                    onChange={(value) => updateSlide(index, "description", value)}
                  />
                  <TextField
                    label="Texto alternativo"
                    value={slide.alt}
                    max={landingLimits.slideAlt}
                    error={fieldErrors[`slides.${index}.alt`]}
                    onChange={(value) => updateSlide(index, "alt", value)}
                  />
                  <UrlField
                    label="URL da imagem"
                    value={slide.imageUrl}
                    error={fieldErrors[`slides.${index}.imageUrl`]}
                    onChange={(value) => updateSlide(index, "imageUrl", value)}
                  />
                  <UrlField
                    label="Link do slide"
                    value={slide.href}
                    error={fieldErrors[`slides.${index}.href`]}
                    onChange={(value) => updateSlide(index, "href", value)}
                  />
                </article>
              ))}
            </div>
          </section>

          <section
            className="panel landing-tab-panel"
            id="panel-plans"
            role="tabpanel"
            aria-labelledby="tab-plans"
            hidden={activeTab !== "plans"}
          >
            <p className="eyebrow">CATÁLOGO</p>
            <h2>Exibição dos planos</h2>
            <p className="muted">
              Preços, limites, módulos e slugs continuam sob responsabilidade do catálogo.
            </p>
            <VisibilityToggle
              checked={settings.visibility.showPlans}
              label="Exibir comparação de planos"
              description="Disponibiliza a seção de planos na landing publicada."
              onChange={(value) => updateVisibility("showPlans", value)}
            />
            <label>
              Plano destacado
              <select
                value={settings.planPresentation.highlightedPlan}
                onChange={(event) =>
                  updateSettings("planPresentation", {
                    ...settings.planPresentation,
                    highlightedPlan: event.target.value as PlanName,
                  })
                }
              >
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <FieldError message={fieldErrors["planPresentation.highlightedPlan"]} />
            </label>
            <div className="landing-fields">
              {(["starter", "pro", "enterprise"] as PlanName[]).map((plan) => (
                <TextField
                  key={plan}
                  label={`CTA ${plan}`}
                  value={settings.planPresentation.ctaLabels[plan]}
                  max={landingLimits.ctaLabel}
                  error={fieldErrors[`plans.${plan}`]}
                  onChange={(value) =>
                    updateSettings("planPresentation", {
                      ...settings.planPresentation,
                      ctaLabels: { ...settings.planPresentation.ctaLabels, [plan]: value },
                    })
                  }
                />
              ))}
            </div>
          </section>

          <section
            className="panel landing-tab-panel"
            id="panel-social-proof"
            role="tabpanel"
            aria-labelledby="tab-social-proof"
            hidden={activeTab !== "social-proof"}
          >
            <p className="eyebrow">MODERAÇÃO</p>
            <h2>Depoimentos autorizados</h2>
            <TextField
              label="Título da prova social"
              value={settings.socialProof.title}
              max={landingLimits.socialProofTitle}
              error={fieldErrors["socialProof.title"]}
              onChange={(value) => updateSettings("socialProof", { title: value })}
            />
            <VisibilityToggle
              checked={settings.visibility.showTestimonials}
              label="Exibir depoimentos"
              description="Mostra somente avaliações moderadas e autorizadas."
              onChange={(value) => updateVisibility("showTestimonials", value)}
            />
            <Link className="text-button" href="/testimonials">
              Gerenciar depoimentos
            </Link>
          </section>

          <section
            className="panel landing-tab-panel"
            id="panel-sections-footer"
            role="tabpanel"
            aria-labelledby="tab-sections-footer"
            hidden={activeTab !== "sections-footer"}
          >
            <p className="eyebrow">VISIBILIDADE E RODAPÉ</p>
            <h2>Seções públicas</h2>
            <div className="landing-toggles">
              <VisibilityToggle
                checked={settings.visibility.showProduct}
                label="Exibir produto"
                description="Mostra a vitrine do produto."
                onChange={(value) => updateVisibility("showProduct", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showMigration}
                label="Exibir migração"
                description="Mostra a seção de migração."
                onChange={(value) => updateVisibility("showMigration", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showPlans}
                label="Exibir planos"
                description="Mostra a comparação de planos."
                onChange={(value) => updateVisibility("showPlans", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showTestimonials}
                label="Exibir prova social"
                description="Mostra avaliações autorizadas."
                onChange={(value) => updateVisibility("showTestimonials", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showSegments}
                label="Exibir segmentos"
                description="Mostra os segmentos atendidos."
                onChange={(value) => updateVisibility("showSegments", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showSecurity}
                label="Exibir segurança"
                description="Mostra a seção de segurança."
                onChange={(value) => updateVisibility("showSecurity", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showFaq}
                label="Exibir perguntas frequentes"
                description="Mostra as perguntas frequentes."
                onChange={(value) => updateVisibility("showFaq", value)}
              />
              <VisibilityToggle
                checked={settings.visibility.showCalculator}
                label="Exibir calculadora"
                description="Mostra a calculadora comercial."
                onChange={(value) => updateVisibility("showCalculator", value)}
              />
            </div>
            <CtaFields
              title="CTA final"
              cta={settings.finalCta}
              errors={fieldErrors}
              errorPrefix="finalCta"
              onChange={(field, value) => updateCta("finalCta", field, value)}
            />
            <div className="panel-heading">
              <h3>Links do rodapé</h3>
              <button
                className="btn small"
                type="button"
                onClick={addFooterLink}
                disabled={settings.footerLinks.length >= landingLimits.footerLinks}
              >
                <Plus className="button-icon" aria-hidden="true" />
                Adicionar link
              </button>
            </div>
            <FieldError message={fieldErrors.footerLinks} />
            <div className="landing-slides">
              {settings.footerLinks.map((link, index) => (
                <article className="landing-slide" key={`${link.label}-${index}`}>
                  <div className="landing-slide-heading">
                    <strong>Link {index + 1}</strong>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remover link ${index + 1}`}
                      title="Remover link"
                      onClick={() =>
                        updateSettings(
                          "footerLinks",
                          settings.footerLinks.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                  <TextField
                    label="Rótulo"
                    value={link.label}
                    max={80}
                    error={fieldErrors[`footerLinks.${index}.label`]}
                    onChange={(value) =>
                      updateSettings(
                        "footerLinks",
                        settings.footerLinks.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: value } : item,
                        ),
                      )
                    }
                  />
                  <UrlField
                    label="URL"
                    value={link.href}
                    error={fieldErrors[`footerLinks.${index}.href`]}
                    onChange={(value) =>
                      updateSettings(
                        "footerLinks",
                        settings.footerLinks.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, href: value } : item,
                        ),
                      )
                    }
                  />
                </article>
              ))}
            </div>
          </section>

          <section
            className="panel landing-tab-panel"
            id="panel-history"
            role="tabpanel"
            aria-labelledby="tab-history"
            hidden={activeTab !== "history"}
          >
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PUBLICAÇÕES</p>
                <h2>Histórico de versões</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                title="Atualizar histórico"
                aria-label="Atualizar histórico"
                onClick={() => void loadRevisions()}
                disabled={revisionsLoading}
              >
                {revisionsLoading ? (
                  <LoaderCircle className="spinning" aria-label="Atualizando histórico" />
                ) : (
                  <History aria-hidden="true" />
                )}
              </button>
            </div>
            {historyError && (
              <p className="feedback error" role="alert">
                {historyError}
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Publicada em</th>
                    <th>Operador</th>
                    <th>Título</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.length === 0 ? (
                    <tr>
                      <td className="empty" colSpan={4}>
                        Nenhuma versão publicada ainda.
                      </td>
                    </tr>
                  ) : (
                    revisions.map((revision) => (
                      <tr key={revision.id}>
                        <td>
                          {formatDate(revision.publishedAt)}
                          {revision.restoredFromId && (
                            <small>Restaurada de uma versão anterior</small>
                          )}
                        </td>
                        <td>{revision.publishedBy ?? "Operador não informado"}</td>
                        <td>{revision.value.hero.title}</td>
                        <td>
                          <button
                            className="btn small"
                            type="button"
                            disabled={saving || restoringId === revision.id}
                            onClick={() => void restore(revision)}
                          >
                            <RotateCcw className="button-icon" aria-hidden="true" />
                            <LoadingButton loading={restoringId === revision.id}>
                              Restaurar esta versão
                            </LoadingButton>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </fieldset>
      </form>
    </main>
  );
}

function TextField({
  label,
  value,
  max,
  error,
  onChange,
}: {
  label: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>
        {label}
        <CharacterCount value={value} max={max} />
      </span>
      <input
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      <FieldError message={error} />
    </label>
  );
}

function TextAreaField({
  className,
  label,
  value,
  max,
  error,
  onChange,
}: {
  className?: string;
  label: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={className}>
      <span>
        {label}
        <CharacterCount value={value} max={max} />
      </span>
      <textarea
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      <FieldError message={error} />
    </label>
  );
}

function UrlField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
      />
      <FieldError message={error} />
    </label>
  );
}

function CtaFields({
  title,
  cta,
  errors,
  errorPrefix,
  onChange,
}: {
  title: string;
  cta: Cta;
  errors: FieldErrors;
  errorPrefix: string;
  onChange: (field: keyof Cta, value: string) => void;
}) {
  return (
    <fieldset className="landing-fieldset">
      <legend>{title}</legend>
      <TextField
        label="Rótulo"
        value={cta.label}
        max={landingLimits.ctaLabel}
        error={errors[`${errorPrefix}.label`]}
        onChange={(value) => onChange("label", value)}
      />
      <UrlField
        label="URL permitida"
        value={cta.href}
        error={errors[`${errorPrefix}.href`]}
        onChange={(value) => onChange("href", value)}
      />
    </fieldset>
  );
}

function VisibilityToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  label: string;
  description: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data indisponível"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
