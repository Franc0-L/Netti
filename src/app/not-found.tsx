import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <Link className="wordmark" href="/">NETTI<span>.</span></Link>
      </header>
      <section className="empty-state error-state">
        <p className="eyebrow">ERROR 404</p>
        <h1>Esta página no existe.</h1>
        <p>El enlace puede estar roto o el contenido ya no estar disponible.</p>
        <Link className="primary-link" href="/">Volver a Netti</Link>
      </section>
    </main>
  );
}
