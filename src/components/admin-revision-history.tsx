'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { restoreRevision } from '@/app/actions/content';
import { REVISION_RETENTION } from '@/lib/revisions';

type Revision = {
  id: number;
  version: number;
  createdAt: Date;
};

type Props = {
  articleId: number;
  revisions: Revision[];
  currentVersion: number;
};

/**
 * Revision history of an article.
 *
 * Restoring a snapshot is a normal save: the database bumps the version and
 * the page refresh hands the new snapshot down to the editor, which syncs
 * through the `version` prop. Nothing is deleted.
 */
export function AdminRevisionHistory({ articleId, revisions, currentVersion }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function restore(revisionId: number) {
    if (!window.confirm('¿Restaurar esta revisión? Se guardará como una versión nueva.')) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await restoreRevision({ articleId, revisionId });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage('Revisión restaurada. El editor se actualizó con la versión nueva.');
      router.refresh();
    } catch {
      setMessage('No se pudo restaurar la revisión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-panel admin-revisions">
      <h2>Historial de revisiones</h2>
      <p className="admin-muted">
        Se conservan las últimas {REVISION_RETENTION} versiones. Restaurar crea una versión nueva,
        no borra nada.
      </p>
      {message ? (
        <p className="admin-error" role="alert">
          {message}
        </p>
      ) : null}
      {revisions.length === 0 ? (
        <p className="admin-muted">Todavía no hay revisiones guardadas.</p>
      ) : (
        <ol className="admin-revision-list">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <span>
                <strong>v{revision.version}</strong>{' '}
                <time dateTime={revision.createdAt.toISOString()}>
                  {new Intl.DateTimeFormat('es-AR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(revision.createdAt)}
                </time>
                {revision.version === currentVersion ? (
                  <span className="admin-muted"> · versión actual</span>
                ) : null}
              </span>
              {revision.version === currentVersion ? null : (
                <button
                  className="admin-button admin-button-quiet"
                  type="button"
                  disabled={busy}
                  onClick={() => void restore(revision.id)}
                >
                  Restaurar
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
