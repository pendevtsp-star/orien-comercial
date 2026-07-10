import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });

export const metadata: Metadata = {
  title: `${process.env.NEXT_PUBLIC_APP_NAME ?? "Orien"} | Gestao comercial para empresas modernas`,
  description: "SaaS multitenant para vendas, estoque, clientes, financeiro e relacionamento."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${playfair.variable}`}>{children}</body>
    </html>
  );
}
