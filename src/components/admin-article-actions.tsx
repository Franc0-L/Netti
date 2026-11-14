'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  publishArticle,
  restoreArticle,
  trashArticle,
  unpublishArticle,
} from '@/app/actions/content';

type Props = {
  id: number;
  version: number;
  status: 'draft' | 'published' | 'trashed';
};

/**
 * Lifecycle actions of an article.
 *
 * Publishing and unpublishing are reversible and need no confirmation; moving
 * an article to the trash asks first because it disappears from the panel.
 */
export function AdminArticleActions({ id, version, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function run(action: () => Promise<{ ok: boolean; message?: string }>, redirect?: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (!result.ok) {
        setMessage(result.message ?? 'No se pudo completar la acción.');
        return;
      }
      if (redirect) router.replace(redirect);
      router.refresh();
    } catch {
      setMessage('No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-actions">
      {status === 'draft' ? (
        <button
          className="admin-button admin-button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => publishArticle({ id, version }))}
        >
          Publicar
        </button>
      ) : null}
      {status === 'published' ? (
        <button
          className="admin-button admin-button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => unpublishArticle({ id, version }))}
        >
          Despublicar
        </button>
      ) : null}
      {status === 'trashed' ? (
        <button
          className="admin-button admin-button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => restoreArticle({ id, version }))}
        >
          Restaurar
        </button>
      ) : (
        <button
          className="admin-button admin-button-quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('¿Mover el artículo a la papelera?')) return;
            void run(() => trashArticle({ id, version }), '/admin');
          }}
        >
          Mover a la papelera
        </button>
      )}
      {message ? (
        <span className="admin-error" role="alert">
          {message}
        </span>
      ) : null}
    </div>
  );
}
