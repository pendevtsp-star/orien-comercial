import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { SentryClient } from "../components/sentry-client";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });

const siteUrl = "https://useorien.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Orien | Gestão Comercial Inteligente para Empresas",
    template: "%s | Orien",
  },
  description:
    "Plataforma SaaS para gestão de vendas, estoque, clientes, financeiro e relacionamento. PDV, relatórios, multi-lojas, fiscal e IA integrada. Teste grátis por 14 dias.",
  keywords: [
    "gestão comercial",
    "sistema vendas",
    "pdv",
    "estoque",
    "financeiro",
    "multi-loja",
    "saas",
    "erp",
    "nota fiscal",
    "faturamento",
  ],
  authors: [{ name: "Orien", url: siteUrl }],
  creator: "Orien",
  publisher: "Orien",
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "Orien",
    title: "Orien | Gestão Comercial Inteligente para Empresas",
    description:
      "Plataforma SaaS para gestão de vendas, estoque, clientes, financeiro e relacionamento. PDV, relatórios, multi-lojas e IA.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Orien - Gestão Comercial Inteligente",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Orien | Gestão Comercial Inteligente",
    description:
      "Plataforma SaaS para gestão de vendas, estoque, clientes e financeiro.",
    images: [`${siteUrl}/og-image.png`],
    creator: "@useorien",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  alternates: { canonical: siteUrl },
  icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Orien",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "Plataforma SaaS para gestão de vendas, estoque, clientes, financeiro e relacionamento.",
              url: siteUrl,
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BRL",
                description: "Teste grátis por 14 dias",
              },
              provider: {
                "@type": "Organization",
                name: "Orien",
                url: siteUrl,
              },
            }),
          }}
        />
      </head>
      <body className={`${inter.variable} ${playfair.variable}`}>
        <SentryClient />
        {children}
      </body>
    </html>
  );
}
