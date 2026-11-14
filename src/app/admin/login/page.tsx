import type { Metadata } from 'next';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin-login-form';
import { SkipLink } from '@/components/site-chrome';
import { requireSession, SessionRequiredError } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'Ingresar al panel',
  robots: { index: false, follow: false },
};

/**
 * Blocking route.
 *
 * The page checks the session before rendering the form, so the response waits
 * for the full render instead of streaming a shell.
 */
export const instant = false;

export default async function AdminLoginPage() {
  await connection();
  let authenticated = false;
  try {
    // Server Component: cookies cannot be mutated here, so an expired session
    // only leaves the login form visible.
    await requireSession();
    authenticated = true;
  } catch (error) {
    // Only a missing session shows the form. An infrastructure failure must
    // surface as an error instead of pretending the author was logged out.
    if (!(error instanceof SessionRequiredError)) {
      logger.error('admin.login.session.check.failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }
  if (authenticated) redirect('/admin');
  return (
    <>
      <SkipLink />
      <main className="admin-login-page" id="contenido" tabIndex={-1}>
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <p className="admin-eyebrow">NETTI / STUDIO</p>
          <h1 id="admin-login-title">Ingresar</h1>
          <p>Acceso privado al espacio editorial de Netti.</p>
          <AdminLoginForm />
        </section>
      </main>
    </>
  );
}
