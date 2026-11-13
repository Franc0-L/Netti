import type { Metadata } from 'next';
import { SiteFooter, SiteHeader, SkipLink } from '@/components/site-chrome';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description: 'Qué datos recopila Netti y cómo se usan.',
};

export default function PrivacyPage() {
  return (
    <div className="site-shell">
      <SkipLink />
      <SiteHeader currentPath="/privacidad" />
      <main id="contenido" tabIndex={-1}>
        <article className="article-page">
          <header className="article-header">
            <p className="eyebrow">LEGAL</p>
            <h1>Política de privacidad</h1>
            <p className="article-deck">Qué datos se guardan, para qué y cuánto tiempo duran.</p>
          </header>
          <div className="article-prose">
            <p>
              Netti guarda la información mínima necesaria para publicar el sitio y proteger el
              acceso editorial.
            </p>
            <h2>Datos de navegación</h2>
            <p>
              El servidor registra datos técnicos básicos (dirección IP cifrada, navegador y página
              solicitada) para detectar abuso. No se usan perfiles publicitarios ni cookies de
              seguimiento de terceros.
            </p>
            <h2>Acceso editorial</h2>
            <p>
              Las sesiones de la redacción se guardan como hash del token y caducan de forma
              automática. Las contraseñas nunca se guardan en texto plano.
            </p>
            <h2>Contacto</h2>
            <p>Para cualquier consulta sobre privacidad: nettivideojuegos@gmail.com.</p>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
