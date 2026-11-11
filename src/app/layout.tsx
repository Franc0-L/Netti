import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

/**
 * Absolute URL base for metadata (canonical links and Open Graph images).
 *
 * Falls back to the local address when `PUBLIC_SITE_URL` is missing so the
 * build never fails because of an unset environment variable.
 */
function resolveMetadataBase(): URL {
  try {
    return new URL(process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000');
  } catch {
    return new URL('http://localhost:3000');
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: 'Netti — Videojuegos, con criterio',
    template: '%s | Netti',
  },
  description: 'Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.',
  applicationName: 'Netti',
  category: 'technology',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: 'Netti',
    title: 'Netti — Videojuegos, con criterio',
    description: 'Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Netti — Videojuegos, con criterio',
    description: 'Reseñas, noticias y guías de videojuegos. Análisis y contexto, sin ruido.',
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
