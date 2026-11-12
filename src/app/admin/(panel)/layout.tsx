import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { SkipLink } from '@/components/site-chrome';
import { requireSession } from '@/lib/auth';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Blocking route.
 *
 * The panel checks the session before rendering anything. The response waits
 * for the full render so an anonymous visitor gets a redirect instead of a
 * streamed shell.
 */
export const instant = false;

export default async function AdminPanelLayout({ children }: Readonly<{ children: ReactNode }>) {
  await connection();
  try {
    // Server Component: cookies cannot be mutated here, so an expired session
    // only redirects to the login page.
    await requireSession();
  } catch {
    redirect('/admin/login');
  }
  return (
    <div className="admin-shell">
      <SkipLink />
      <AdminNav />
      <main className="admin-main" id="contenido" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
