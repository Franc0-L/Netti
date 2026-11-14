import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin-nav';
import { SkipLink } from '@/components/site-chrome';
import { requireSession, SessionRequiredError } from '@/lib/auth';
import { logger } from '@/lib/logger';

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
  } catch (error) {
    // Only a missing session means "log in". A database failure is an
    // infrastructure problem and must not look like an expired session.
    if (!(error instanceof SessionRequiredError)) {
      logger.error('admin.session.check.failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
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
