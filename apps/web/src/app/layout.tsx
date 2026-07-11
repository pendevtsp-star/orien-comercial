import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? "Orien",
  description: "Painel SaaS multitenant para gestao comercial.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const p=JSON.parse(localStorage.getItem('orien.preferences')||'{}');const dark=p.colorMode==='dark'||(p.colorMode!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.dataset.theme=p.theme||'orien';document.documentElement.dataset.colorMode=dark?'dark':'light';document.documentElement.dataset.density=p.density||'comfortable';document.documentElement.dataset.reduceMotion=String(Boolean(p.reduceMotion));document.documentElement.dataset.dashboardWidgets=(p.dashboardWidgets||['executive','financial','indicators','performance','period','goals']).join(' ');}catch{}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${playfair.variable}`}>{children}</body>
    </html>
  );
}
