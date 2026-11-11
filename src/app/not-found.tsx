import Link from 'next/link';
import { SiteHeader, SkipLink } from '@/components/site-chrome';

export default function NotFound() {
  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader />
      <main id="contenido" tabIndex={-1}>
        <section className="empty-state error-state">
          <p className="eyebrow">ERROR 404</p>
          <h1>Esta página no existe.</h1>
          <p>El enlace puede estar roto o el contenido ya no estar disponible.</p>
          <Link className="primary-link" href="/">
            Volver a Netti
          </Link>
        </section>
      </main>
    </div>
  );
}
