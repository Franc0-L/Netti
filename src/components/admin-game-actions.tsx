'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { publishGame, restoreGame, trashGame, unpublishGame } from '@/app/actions/games';

type Props = {
  id: number;
  status: 'draft' | 'published' | 'trashed';
};

/** Lifecycle actions of a game sheet. */
export function AdminGameActions({ id, status }: Props) {
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
          onClick={() => void run(() => publishGame({ id }))}
        >
          Publicar
        </button>
      ) : null}
      {status === 'published' ? (
        <button
          className="admin-button admin-button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => unpublishGame({ id }))}
        >
          Despublicar
        </button>
      ) : null}
      {status === 'trashed' ? (
        <button
          className="admin-button admin-button-secondary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => restoreGame({ id }))}
        >
          Restaurar
        </button>
      ) : (
        <button
          className="admin-button admin-button-quiet"
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm('¿Mover la ficha a la papelera?')) return;
            void run(() => trashGame({ id }), '/admin/games');
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
