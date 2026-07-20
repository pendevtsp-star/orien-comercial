import { z } from "zod";

const DEFAULT_CHECKOUT_PATH = "/checkout?plan=pro";
const DEFAULT_SECONDARY_CTA = { label: "Falar com especialista", href: "/contato" };

const safeCopy = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine((value) => !/[<>{}]/.test(value), "HTML and CSS markup are not allowed");

const safeOptionalCopy = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .refine((value) => !/[<>{}]/.test(value), "HTML and CSS markup are not allowed")
    .default("");

const safeHref = z.string().trim().refine(isSafeHref, "Unsafe URL");
const safeImageUrl = z.string().trim().max(500).refine(isSafeShowcaseImageUrl, "Unsafe image URL");
const safeOptionalHref = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => validOrDefault(safeHref, value, ""));
const safeOptionalImageUrl = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((value) => validOrDefault(safeImageUrl, value, ""));
const safeSupportEmail = z.string().trim().max(254).email().or(z.literal(""));

const ctaSchema = z.object({
  label: safeCopy(80),
  href: safeHref,
});

const slideSchema = z.object({
  eyebrow: safeOptionalCopy(90),
  title: safeCopy(150),
  description: safeCopy(320),
  alt: safeCopy(160),
  imageUrl: safeOptionalImageUrl,
  href: safeOptionalHref,
  isVisible: z.boolean(),
});

const testimonialSchema = z.object({
  testimonialRequestId: safeOptionalCopy(80),
  name: safeCopy(100),
  company: safeOptionalCopy(120),
  role: safeOptionalCopy(100),
  quote: safeCopy(700),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => validOrDefault(safeImageUrl, value, "")),
});

const visibilitySchema = z.object({
  showCalculator: z.boolean(),
  showTestimonials: z.boolean(),
  showFaq: z.boolean(),
  showPlans: z.boolean(),
  showSegments: z.boolean(),
  showProduct: z.boolean(),
  showMigration: z.boolean(),
  showSecurity: z.boolean(),
});

const planPresentationSchema = z.object({
  highlightedPlan: z.enum(["starter", "pro", "enterprise"]),
  ctaLabels: z.object({
    starter: safeCopy(80),
    pro: safeCopy(80),
    enterprise: safeCopy(80),
  }),
});

const socialProofSchema = z.object({
  title: safeCopy(140),
});

const adminSchema = z.object({
  internalNotes: z.string().trim().max(1_000).default(""),
  updatedBy: z.string().trim().max(100).default(""),
});

export const LandingSettingsSchema = z.object({
  hero: z.object({
    eyebrow: safeCopy(90),
    title: safeCopy(150),
    description: safeCopy(320),
    trialText: safeCopy(140),
    primaryCta: ctaSchema,
    secondaryCta: ctaSchema.nullable(),
  }),
  visibility: visibilitySchema,
  supportEmail: safeSupportEmail,
  whatsappNumber: z.string().trim().max(32),
  whatsappMessage: safeCopy(400),
  showcaseSlides: z.array(slideSchema).max(4),
  planPresentation: planPresentationSchema,
  socialProof: socialProofSchema,
  finalCta: ctaSchema,
  footerLinks: z.array(ctaSchema).max(4),
  testimonials: z.array(testimonialSchema).max(8),
  admin: adminSchema,
});

const DEFAULT_LANDING_SETTINGS: z.input<typeof LandingSettingsSchema> = {
  hero: {
    eyebrow: "Gestão comercial",
    title: "Gestão clara para vender melhor",
    description: "Teste por 7 dias sem cartão e mantenha o seu comercial sob controle.",
    trialText: "Teste por 7 dias sem cartão.",
    primaryCta: { label: "Começar teste gratuito", href: DEFAULT_CHECKOUT_PATH },
    secondaryCta: DEFAULT_SECONDARY_CTA,
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
  finalCta: { label: "Começar teste gratuito", href: DEFAULT_CHECKOUT_PATH },
  footerLinks: [],
  testimonials: [],
  admin: { internalNotes: "", updatedBy: "" },
};

export type LandingSettings = z.output<typeof LandingSettingsSchema>;

export type PublicLandingSettings = Omit<LandingSettings, "admin">;

export function normalizeLandingSettings(value: unknown): LandingSettings {
  return LandingSettingsSchema.parse(mergeWithDefaults(value));
}

export function toPublicLandingSettings(value: unknown): PublicLandingSettings {
  const { admin: _admin, ...settings } = normalizeLandingSettings(value);
  return { ...settings, whatsappNumber: settings.whatsappNumber.replace(/\D/g, "") };
}

function mergeWithDefaults(value: unknown): z.input<typeof LandingSettingsSchema> {
  const input = isRecord(value) ? value : {};
  const hero = isRecord(input.hero) ? input.hero : {};
  const visibility = isRecord(input.visibility) ? input.visibility : {};
  const planPresentation = isRecord(input.planPresentation) ? input.planPresentation : {};
  const planCtaLabels = isRecord(planPresentation.ctaLabels) ? planPresentation.ctaLabels : {};
  const socialProof = isRecord(input.socialProof) ? input.socialProof : {};
  const admin = isRecord(input.admin) ? input.admin : {};

  return {
    hero: {
      eyebrow: validOrDefault(safeCopy(90), hero.eyebrow, DEFAULT_LANDING_SETTINGS.hero.eyebrow),
      title: validOrDefault(safeCopy(150), hero.title, DEFAULT_LANDING_SETTINGS.hero.title),
      description: validOrDefault(
        safeCopy(320),
        hero.description,
        DEFAULT_LANDING_SETTINGS.hero.description,
      ),
      trialText: validOrDefault(
        safeCopy(140),
        hero.trialText,
        DEFAULT_LANDING_SETTINGS.hero.trialText,
      ),
      primaryCta: mergeCta(hero.primaryCta, DEFAULT_LANDING_SETTINGS.hero.primaryCta),
      secondaryCta: mergeSecondaryCta(hero.secondaryCta, DEFAULT_SECONDARY_CTA),
    },
    visibility: {
      showCalculator: validOrDefault(
        z.boolean(),
        visibility.showCalculator,
        DEFAULT_LANDING_SETTINGS.visibility.showCalculator,
      ),
      showTestimonials: validOrDefault(
        z.boolean(),
        visibility.showTestimonials,
        DEFAULT_LANDING_SETTINGS.visibility.showTestimonials,
      ),
      showFaq: validOrDefault(
        z.boolean(),
        visibility.showFaq,
        DEFAULT_LANDING_SETTINGS.visibility.showFaq,
      ),
      showPlans: validOrDefault(
        z.boolean(),
        visibility.showPlans,
        DEFAULT_LANDING_SETTINGS.visibility.showPlans,
      ),
      showSegments: validOrDefault(
        z.boolean(),
        visibility.showSegments,
        DEFAULT_LANDING_SETTINGS.visibility.showSegments,
      ),
      showProduct: validOrDefault(
        z.boolean(),
        visibility.showProduct,
        DEFAULT_LANDING_SETTINGS.visibility.showProduct,
      ),
      showMigration: validOrDefault(
        z.boolean(),
        visibility.showMigration,
        DEFAULT_LANDING_SETTINGS.visibility.showMigration,
      ),
      showSecurity: validOrDefault(
        z.boolean(),
        visibility.showSecurity,
        DEFAULT_LANDING_SETTINGS.visibility.showSecurity,
      ),
    },
    supportEmail: validOrDefault(safeSupportEmail, input.supportEmail, ""),
    whatsappNumber: validOrDefault(z.string().trim().max(32), input.whatsappNumber, ""),
    whatsappMessage: validOrDefault(
      safeCopy(400),
      input.whatsappMessage,
      DEFAULT_LANDING_SETTINGS.whatsappMessage,
    ),
    showcaseSlides: normalizeSlides(input.showcaseSlides),
    planPresentation: {
      highlightedPlan: validOrDefault(
        z.enum(["starter", "pro", "enterprise"]),
        planPresentation.highlightedPlan,
        DEFAULT_LANDING_SETTINGS.planPresentation.highlightedPlan,
      ),
      ctaLabels: {
        starter: validOrDefault(
          safeCopy(80),
          planCtaLabels.starter,
          DEFAULT_LANDING_SETTINGS.planPresentation.ctaLabels.starter,
        ),
        pro: validOrDefault(
          safeCopy(80),
          planCtaLabels.pro,
          DEFAULT_LANDING_SETTINGS.planPresentation.ctaLabels.pro,
        ),
        enterprise: validOrDefault(
          safeCopy(80),
          planCtaLabels.enterprise,
          DEFAULT_LANDING_SETTINGS.planPresentation.ctaLabels.enterprise,
        ),
      },
    },
    socialProof: {
      title: validOrDefault(
        safeCopy(140),
        socialProof.title,
        DEFAULT_LANDING_SETTINGS.socialProof.title,
      ),
    },
    finalCta: mergeCta(input.finalCta, DEFAULT_LANDING_SETTINGS.finalCta),
    footerLinks: normalizeFooterLinks(input.footerLinks),
    testimonials: normalizeTestimonials(input.testimonials),
    admin: {
      internalNotes: validOrDefault(
        z.string().trim().max(1_000),
        admin.internalNotes,
        DEFAULT_LANDING_SETTINGS.admin.internalNotes,
      ),
      updatedBy: validOrDefault(
        z.string().trim().max(100),
        admin.updatedBy,
        DEFAULT_LANDING_SETTINGS.admin.updatedBy,
      ),
    },
  };
}

function mergeCta(
  value: unknown,
  fallback: z.input<typeof ctaSchema>,
  invalidHrefFallback = fallback.href,
) {
  const input = isRecord(value) ? value : {};
  return {
    label: validOrDefault(safeCopy(80), input.label, fallback.label),
    href: validOrDefault(safeHref, input.href, invalidHrefFallback),
  };
}

function mergeSecondaryCta(value: unknown, fallback: z.input<typeof ctaSchema>) {
  if (value === null) return null;
  if (!isRecord(value)) return mergeCta(value, fallback);
  return mergeCta(value, fallback, DEFAULT_CHECKOUT_PATH);
}

function normalizeSlides(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_LANDING_SETTINGS.showcaseSlides;

  return value.slice(0, 4).flatMap((value) => {
    const slide = isRecord(value) ? value : {};
    const title = safeCopy(150).safeParse(slide.title);
    const description = safeCopy(320).safeParse(slide.description);
    if (!title.success || !description.success) return [];

    return [
      {
        eyebrow: validOrDefault(safeOptionalCopy(90), slide.eyebrow, ""),
        title: title.data,
        description: description.data,
        alt: validOrDefault(safeCopy(160), slide.alt, title.data),
        imageUrl: validOrDefault(safeOptionalImageUrl, slide.imageUrl, ""),
        href: validOrDefault(safeOptionalHref, slide.href, ""),
        isVisible: validOrDefault(z.boolean(), slide.isVisible, true),
      },
    ];
  });
}

function normalizeFooterLinks(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_LANDING_SETTINGS.footerLinks;

  return value.slice(0, 4).flatMap((link) => {
    const result = ctaSchema.safeParse(link);
    return result.success ? [result.data] : [];
  });
}

function normalizeTestimonials(value: unknown) {
  if (!Array.isArray(value)) return DEFAULT_LANDING_SETTINGS.testimonials;

  return value.slice(0, 8).flatMap((testimonial) => {
    const result = testimonialSchema.safeParse(testimonial);
    return result.success ? [result.data] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeHref(value: string) {
  if (/^https:/i.test(value)) {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }

  return isSafeInternalPath(value);
}

function isSafeShowcaseImageUrl(value: string) {
  if (value.startsWith("/product-showcase/") && isSafeInternalPath(value)) return true;

  try {
    return new URL(value).protocol === "https:";
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

function validOrDefault<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}
