import Link from 'next/link';

const NAV_ITEMS = [
  { href: '/resenas', label: 'Reseñas' },
  { href: '/noticias', label: 'Noticias' },
  { href: '/guias', label: 'Guías' },
];

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
        NETTI<span>.</span>
      </Link>
      <nav aria-label="Navegación principal" className="site-nav">
        {NAV_ITEMS.map((item) => (
          <Link
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

export function SiteFooter({ showBackToTop = false }: { showBackToTop?: boolean }) {
  return (
    <footer className="site-footer">
      <span>
        NETTI<span className="accent">.</span>
      </span>
      <span>Videojuegos, con criterio.</span>
      {showBackToTop ? <a href="#top">Volver arriba ↑</a> : null}
    </footer>
  );
}
