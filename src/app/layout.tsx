import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "APS Decisão Clínica — Apoio Rápido em Consultório",
  description:
    "Plataforma privada de apoio rápido à decisão clínica na Atenção Primária à Saúde (APS): manuais originais com fluxogramas em alta nitidez e TelessaúdeRS-UFRGS.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen font-sans antialiased selection:bg-sky-200 selection:text-slate-900 dark:selection:bg-sky-800 dark:selection:text-slate-100">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
