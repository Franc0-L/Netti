import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { cacheLife } from 'next/cache';

const NAV_ITEMS = [
  { href: '/juegos', label: 'Juegos' },
  { href: '/resenas', label: 'Reseñas' },
  { href: '/noticias', label: 'Noticias' },
  { href: '/guias', label: 'Guías' },
];

const CONTACT_EMAIL = 'nettivideojuegos@gmail.com';

const SOCIALS = [
  {
    href: 'https://www.youtube.com/@NettiVJ',
    label: 'YouTube',
    icon: (
      <>
        <rect
          x="2.5"
          y="5.5"
          width="19"
          height="13"
          rx="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M10.2 9.2 15.3 12l-5.1 2.8Z" fill="currentColor" />
      </>
    ),
  },
  {
    href: 'https://www.instagram.com/nettivideojuegos',
    label: 'Instagram',
    icon: (
      <>
        <rect
          x="3.5"
          y="3.5"
          width="17"
          height="17"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17" cy="7" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    href: 'https://www.tiktok.com/@nettivj',
    label: 'TikTok',
    icon: (
      <path
        fill="currentColor"
        d="M14 3h2.3c.3 2 1.7 3.5 3.7 3.7v2.4c-1.4 0-2.7-.4-3.8-1.2v6.9a5.2 5.2 0 1 1-5.2-5.2c.3 0 .7 0 1 .1v2.5a2.7 2.7 0 1 0 1.7 2.5V3Z"
      />
    ),
  },
];

/** Icons of the footer sections, kept inline as in the legacy site. */
const SECTION_ICONS = {
  juegos: (
    <>
      <path d="M7.5 7h9a5.5 5.5 0 0 1 5.4 6.6l-.8 3.8A2.6 2.6 0 0 1 16.6 18l-1.1-2h-7l-1.1 2a2.6 2.6 0 0 1-4.5-.6l-.8-3.8A5.5 5.5 0 0 1 7.5 7Z" />
      <path d="M8 11v3M6.5 12.5h3" />
      <circle cx="16.2" cy="11.5" r=".9" fill="currentColor" stroke="none" />
      <circle cx="18.6" cy="13.4" r=".9" fill="currentColor" stroke="none" />
    </>
  ),
  resenas: <path d="m12 3 2.7 5.7 6.3 .8-4.6 4.3 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.5l6.3-.8Z" />,
  noticias: (
    <>
      <path d="M4 5h13v14H4Z" />
      <path d="M17 8h3v8a3 3 0 0 1-3 3" />
      <path d="M7 8h7M7 11h7M7 14h4" />
    </>
  ),
  guias: (
    <>
      <path d="M5 4h6a2 2 0 0 1 2 2v14a3 3 0 0 0-3-3H5V4Z" />
      <path d="M19 4h-6a2 2 0 0 0-2 2v14a3 3 0 0 1 3-3h5V4Z" />
    </>
  ),
  buscar: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.8-4.8" />
    </>
  ),
  terminos: (
    <>
      <path d="M7 3h7l4 4v14H7Z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h5M10 16h5" />
    </>
  ),
  privacidad: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />,
} as const;

function SectionIcon({
  name,
  tone,
  filled = false,
}: {
  name: keyof typeof SECTION_ICONS;
  tone?: 'cyan' | 'gold' | 'red' | 'green';
  filled?: boolean;
}) {
  return (
    <svg
      className={tone ? `footer-icon footer-icon-${tone}` : 'footer-icon'}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SECTION_ICONS[name]}
    </svg>
  );
}

/**
 * Skip link for keyboard and screen reader users.
 *
 * It is the first focusable element of every public page so the repetitive
 * navigation can be bypassed (WCAG 2.4.1).
 */
export function SkipLink({ target = 'contenido' }: { target?: string }) {
  return (
    <a className="skip-link" href={`#${target}`}>
      Ir al contenido principal
    </a>
  );
}

export function SiteHeader({ currentPath }: { currentPath?: string }) {
  return (
    <header className="site-header">
      <Link
        className="wordmark"
        href="/"
        aria-label="Netti, inicio"
        aria-current={currentPath === '/' ? 'page' : undefined}
      >
        NETTI<span aria-hidden="true">.</span>
      </Link>
      <nav aria-label="Navegación principal" className="site-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            className="nav-pill"
            href={item.href}
            key={item.href}
            aria-current={currentPath === item.href ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/**
 * Year of the legal notice.
 *
 * It is cached so the footer can be prerendered: reading the clock during the
 * render would make every static page dynamic.
 */
const currentYear = cache(async () => {
  'use cache';
  cacheLife('hours');
  return new Date().getFullYear();
});

export async function SiteFooter({ showBackToTop = false }: { showBackToTop?: boolean }) {
  const year = await currentYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Image
            className="footer-logo"
            src="/images/logo-netti.png"
            alt=""
            width={72}
            height={72}
          />
          <p className="footer-name">
            NETTI<span aria-hidden="true">.</span>
          </p>
          <p className="footer-tag">
            Reseñas, fichas y noticias de videojuegos. Hecho para quienes juegan
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                fill="var(--red)"
                d="M12 21C3.5 15 2 9.2 5.8 6.3 8.4 4.3 10.8 5.9 12 7.7 13.2 5.9 15.6 4.3 18.2 6.3 22 9.2 20.5 15 12 21Z"
              />
            </svg>
          </p>
          {showBackToTop ? <a href="#top">Volver arriba ↑</a> : null}
        </div>

        <nav className="footer-col" aria-label="Secciones del sitio">
          <h2 className="footer-heading">Secciones</h2>
          <ul>
            <li>
              <Link href="/juegos">
                <SectionIcon name="juegos" tone="cyan" />
                Juegos
              </Link>
            </li>
            <li>
              <Link href="/resenas">
                <SectionIcon name="resenas" tone="gold" filled />
                Reseñas
              </Link>
            </li>
            <li>
              <Link href="/noticias">
                <SectionIcon name="noticias" tone="red" />
                Noticias
              </Link>
            </li>
            <li>
              <Link href="/guias">
                <SectionIcon name="guias" tone="green" />
                Guías
              </Link>
            </li>
            <li>
              <Link href="/buscar">
                <SectionIcon name="buscar" />
                Buscar
              </Link>
            </li>
          </ul>
        </nav>

        <nav className="footer-col" aria-label="Información legal">
          <h2 className="footer-heading">Legal</h2>
          <ul>
            <li>
              <Link href="/terminos">
                <SectionIcon name="terminos" />
                Términos y condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad">
                <SectionIcon name="privacidad" />
                Política de privacidad
              </Link>
            </li>
          </ul>
        </nav>

        <div className="footer-col">
          <h2 className="footer-heading">Contacto</h2>
          <ul>
            <li>
              <a className="footer-mail" href={`mailto:${CONTACT_EMAIL}`}>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>
          <ul className="footer-social">
            {SOCIALS.map((social) => (
              <li key={social.label}>
                <a href={social.href} target="_blank" rel="noopener noreferrer">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {social.icon}
                  </svg>
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="footer-legal-bar">
        © {year} Netti. Los juegos, marcas y arte mencionados pertenecen a sus respectivos estudios
        y distribuidores.
      </p>
    </footer>
  );
}
