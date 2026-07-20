export type LandingCta = {
  label: string;
  href: string;
};

export type LandingSlide = {
  eyebrow: string;
  title: string;
  description: string;
  alt: string;
  imageUrl: string;
  href: string;
  isVisible: boolean;
};

type LandingTestimonial = {
  name: string;
  company: string;
  role: string;
  quote: string;
  imageUrl: string;
};

export type PublicLandingSettings = {
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    trialText: string;
    primaryCta: LandingCta;
    secondaryCta: LandingCta | null;
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
  showcaseSlides: LandingSlide[];
  planPresentation: {
    highlightedPlan: "starter" | "pro" | "enterprise";
    ctaLabels: Record<"starter" | "pro" | "enterprise", string>;
  };
  socialProof: { title: string };
  finalCta: LandingCta;
  footerLinks: LandingCta[];
  testimonials: LandingTestimonial[];
};

const fallbackCta = { label: "Começar teste gratuito", href: "/checkout?plan=pro" };

export const fallbackLandingSettings: PublicLandingSettings = {
  hero: {
    eyebrow: "GESTÃO INTELIGENTE PARA NEGÓCIOS EM CRESCIMENTO",
    title: "Sua operação merece clareza para crescer.",
    description:
      "Vendas, PDV, estoque, financeiro e gestão multiloja em uma plataforma preparada para as próximas decisões.",
    trialText: "Teste gratuito de 7 dias, sem cartão",
    primaryCta: fallbackCta,
    secondaryCta: { label: "Conhecer planos", href: "/checkout?plan=pro" },
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
  socialProof: { title: "Quem organiza a operação sente a diferença." },
  finalCta: fallbackCta,
  footerLinks: [],
  testimonials: [],
};

const api = process.env.NEXT_PUBLIC_API_URL ?? "https://api.useorien.com.br/api/v1";

export async function getLandingSettings(): Promise<PublicLandingSettings> {
  try {
    const response = await fetch(`${api}/public/landing`, {
      cache: "force-cache",
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return fallbackLandingSettings;

    return normalizePublicLandingSettings(await response.json());
  } catch {
    return fallbackLandingSettings;
  }
}

export function normalizePublicLandingSettings(value: unknown): PublicLandingSettings {
  const input = asRecord(value);
  if (!input) return fallbackLandingSettings;

  const hero = asRecord(input.hero);
  const visibility = asRecord(input.visibility);
  const planPresentation = asRecord(input.planPresentation);
  const ctaLabels = asRecord(planPresentation?.ctaLabels);
  const socialProof = asRecord(input.socialProof);

  return {
    hero: {
      eyebrow: safeCopy(hero?.eyebrow, fallbackLandingSettings.hero.eyebrow, 90),
      title: safeCopy(hero?.title, fallbackLandingSettings.hero.title, 150),
      description: safeCopy(hero?.description, fallbackLandingSettings.hero.description, 320),
      trialText: safeCopy(hero?.trialText, fallbackLandingSettings.hero.trialText, 140),
      primaryCta: normalizeCta(hero?.primaryCta, fallbackLandingSettings.hero.primaryCta),
      secondaryCta:
        hero?.secondaryCta === null
          ? null
          : normalizeCta(hero?.secondaryCta, fallbackLandingSettings.hero.secondaryCta!),
    },
    visibility: {
      showCalculator: safeBoolean(visibility?.showCalculator, true),
      showTestimonials: safeBoolean(visibility?.showTestimonials, true),
      showFaq: safeBoolean(visibility?.showFaq, true),
      showPlans: safeBoolean(visibility?.showPlans, true),
      showSegments: safeBoolean(visibility?.showSegments, true),
      showProduct: safeBoolean(visibility?.showProduct, true),
      showMigration: safeBoolean(visibility?.showMigration, true),
      showSecurity: safeBoolean(visibility?.showSecurity, true),
    },
    supportEmail: safeEmail(input.supportEmail),
    whatsappNumber: normalizeWhatsappNumber(input.whatsappNumber),
    whatsappMessage: safeCopy(input.whatsappMessage, fallbackLandingSettings.whatsappMessage, 400),
    showcaseSlides: normalizeSlides(input.showcaseSlides),
    planPresentation: {
      highlightedPlan: normalizePlan(planPresentation?.highlightedPlan),
      ctaLabels: {
        starter: safeCopy(
          ctaLabels?.starter,
          fallbackLandingSettings.planPresentation.ctaLabels.starter,
          80,
        ),
        pro: safeCopy(ctaLabels?.pro, fallbackLandingSettings.planPresentation.ctaLabels.pro, 80),
        enterprise: safeCopy(
          ctaLabels?.enterprise,
          fallbackLandingSettings.planPresentation.ctaLabels.enterprise,
          80,
        ),
      },
    },
    socialProof: {
      title: safeCopy(socialProof?.title, fallbackLandingSettings.socialProof.title, 140),
    },
    finalCta: normalizeCta(input.finalCta, fallbackLandingSettings.finalCta),
    footerLinks: normalizeCtas(input.footerLinks),
    testimonials: normalizeTestimonials(input.testimonials),
  };
}

export function isValidWhatsappNumber(value: string) {
  return /^\d{10,15}$/.test(normalizeWhatsappNumber(value));
}

export function hasVisibleShowcaseSlides(slides: LandingSlide[]) {
  return slides.some((slide) => slide.isVisible);
}

function normalizeCta(value: unknown, fallback: LandingCta): LandingCta {
  const input = asRecord(value);
  return {
    label: safeCopy(input?.label, fallback.label, 80),
    href: safeHref(input?.href, fallback.href),
  };
}

function normalizeCtas(value: unknown): LandingCta[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).flatMap((item) => {
    const input = asRecord(item);
    if (!input || !isSafeHref(input.href) || !isSafeCopy(input.label, 80)) return [];
    return [{ label: input.label.trim(), href: input.href.trim() }];
  });
}

function normalizeSlides(value: unknown): LandingSlide[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).flatMap((item) => {
    const input = asRecord(item);
    if (!input || !isSafeCopy(input.title, 150) || !isSafeCopy(input.description, 320)) return [];
    const title = input.title.trim();
    return [
      {
        eyebrow: safeOptionalCopy(input.eyebrow, 90),
        title,
        description: input.description.trim(),
        alt: safeCopy(input.alt, title, 160),
        imageUrl: isSafeShowcaseImageUrl(input.imageUrl) ? input.imageUrl.trim() : "",
        href: isSafeHref(input.href) ? input.href.trim() : "",
        isVisible: input.isVisible !== false,
      },
    ];
  });
}

function normalizeTestimonials(value: unknown): LandingTestimonial[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 8).flatMap((item) => {
    const input = asRecord(item);
    if (!input || !isSafeCopy(input.name, 100) || !isSafeCopy(input.quote, 700)) return [];
    return [
      {
        name: input.name.trim(),
        quote: input.quote.trim(),
        company: safeOptionalCopy(input.company, 120),
        role: safeOptionalCopy(input.role, 100),
        imageUrl: isSafeHttpsUrl(input.imageUrl) ? input.imageUrl.trim() : "",
      },
    ];
  });
}

export function normalizeWhatsappNumber(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function normalizePlan(value: unknown): "starter" | "pro" | "enterprise" {
  return value === "starter" || value === "pro" || value === "enterprise" ? value : "pro";
}

function safeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function safeEmail(value: unknown) {
  return typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? value
    : "";
}

function safeHref(value: unknown, fallback: string) {
  return isSafeHref(value) ? value.trim() : fallback;
}

function isSafeHref(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const href = value.trim();
  if (/^https:/i.test(href)) {
    try {
      return new URL(href).protocol === "https:";
    } catch {
      return false;
    }
  }

  return isSafeInternalPath(href);
}

function isSafeShowcaseImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const imageUrl = value.trim();
  if (imageUrl.startsWith("/product-showcase/") && isSafeInternalPath(imageUrl)) return true;
  try {
    return new URL(imageUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeInternalPath(value: string) {
  if (
    !value.startsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("..") ||
    value.includes("%")
  )
    return false;

  try {
    const url = new URL(value, "https://internal.invalid");
    const rawPathname = value.split(/[?#]/, 1)[0];
    return url.origin === "https://internal.invalid" && url.pathname === rawPathname;
  } catch {
    return false;
  }
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function safeCopy(value: unknown, fallback: string, maxLength: number) {
  return isSafeCopy(value, maxLength) ? value.trim() : fallback;
}

function safeOptionalCopy(value: unknown, maxLength: number) {
  return isSafeCopy(value, maxLength) ? value.trim() : "";
}

function isSafeCopy(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength &&
    !/[<>{}]/.test(value)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
