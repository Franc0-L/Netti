import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Netti — Videojuegos, con criterio",
    template: "%s | Netti",
  },
  description:
    "Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.",
  applicationName: "Netti",
  category: "technology",
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Netti",
    title: "Netti — Videojuegos, con criterio",
    description:
      "Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Netti — Videojuegos, con criterio",
    description:
      "Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
