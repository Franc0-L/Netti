'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next.js already reports the error on the server. Only the digest is safe
    // to log in the browser: the message and the stack can expose internals.
    if (error.digest) console.error('Netti route error', error.digest);
  }, [error]);

  return (
    <div className="site-shell">
      <main id="contenido" tabIndex={-1}>
        <section className="empty-state error-state" role="alert">
          <p className="eyebrow">ERROR</p>
          <h1>No pudimos cargar esta página.</h1>
          <p>Probá nuevamente. Si el problema continúa, volvé al inicio más tarde.</p>
          <button className="primary-link" type="button" onClick={() => reset()}>
            Reintentar
          </button>
        </section>
      </main>
    </div>
  );
}
