import type { Metadata } from 'next';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Condiciones de uso del sitio de Netti.',
};

export default function TermsPage() {
  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/terminos" />
      <main id="contenido" tabIndex={-1}>
        <article className="article-page">
          <header className="article-header">
            <p className="eyebrow">LEGAL</p>
            <h1>Términos y condiciones</h1>
            <p className="article-deck">
              Uso del sitio, contenido editorial y responsabilidades de cada parte.
            </p>
          </header>
          <div className="article-prose">
            <p>
              Netti es una publicación independiente sobre videojuegos. El contenido del sitio se
              ofrece con fines informativos y de entretenimiento.
            </p>
            <h2>Contenido editorial</h2>
            <p>
              Las reseñas, noticias y guías expresan la opinión de la redacción. Las puntuaciones y
              las rarezas son un criterio editorial propio y no representan la opinión de terceros.
            </p>
            <h2>Propiedad intelectual</h2>
            <p>
              Los juegos, marcas, carátulas y artworks mencionados pertenecen a sus respectivos
              estudios y distribuidores. Netti publica material propio o material autorizado.
            </p>
            <h2>Contacto</h2>
            <p>Para consultas sobre estos términos: nettivideojuegos@gmail.com.</p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
