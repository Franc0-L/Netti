import type { Metadata } from 'next';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin-login-form';
import { SkipLink } from '@/components/site-chrome';
import { requireSession } from '@/lib/auth';

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
    await requireSession();
    authenticated = true;
  } catch {
    /* No hay una sesión activa. */
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
