'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markMediaForDeletion, restoreMedia, updateMedia } from '@/app/actions/media';
import { ContentImage } from '@/components/content-image';

export type MediaRow = {
  id: number;
  publicUrl: string;
  width: number;
  height: number;
  alt: string | null;
  credit: string | null;
  rights: string;
  sourceUrl: string | null;
  pendingDeleteAt: Date | null;
  createdAt: Date;
};

const RIGHTS_LABEL: Record<string, string> = {
  own: 'Propia',
  press: 'Prensa',
  third_party: 'Terceros',
};

type RowProps = { item: MediaRow };

function MediaItem({ item }: RowProps) {
  const router = useRouter();
  const [values, setValues] = useState({
    alt: item.alt ?? '',
    credit: item.credit ?? '',
    rights: item.rights,
    sourceUrl: item.sourceUrl ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const result = await updateMedia({
        id: item.id,
        input: {
          alt: values.alt || null,
          credit: values.credit || null,
          rights: values.rights,
          sourceUrl: values.sourceUrl || null,
        },
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setMessage('Datos guardados.');
      router.refresh();
    } catch {
      setMessage('No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !window.confirm('¿Marcar la imagen para eliminación? Se borra en 24 horas si nadie la usa.')
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const result = await markMediaForDeletion({ id: item.id });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.refresh();
    } catch {
      setMessage('No se pudo marcar la imagen.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setMessage('');
    try {
      const result = await restoreMedia({ id: item.id });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.refresh();
    } catch {
      setMessage('No se pudo restaurar la imagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="admin-media-item" open={Boolean(item.pendingDeleteAt)}>
      <summary>
        <span className="admin-media-thumb">
          <ContentImage
            src={item.publicUrl}
            alt={item.alt || `Imagen ${item.id}`}
            width={96}
            height={72}
          />
        </span>
        <span>
          <strong>#{item.id}</strong> {item.alt || 'Sin texto alternativo'}
          <br />
          <span className="admin-muted">
            {item.width}×{item.height} · {RIGHTS_LABEL[item.rights] ?? item.rights} ·{' '}
            {new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(item.createdAt)}
            {item.pendingDeleteAt ? ' · marcada para eliminación' : ''}
          </span>
        </span>
      </summary>

      <div className="admin-media-body">
        <label className="admin-label" htmlFor={`media-alt-${item.id}`}>
          Texto alternativo
        </label>
        <input
          id={`media-alt-${item.id}`}
          className="admin-input"
          maxLength={200}
          value={values.alt}
          onChange={(e) => setValues((current) => ({ ...current, alt: e.target.value }))}
        />

        <label className="admin-label" htmlFor={`media-rights-${item.id}`}>
          Derechos
        </label>
        <select
          id={`media-rights-${item.id}`}
          className="admin-input"
          value={values.rights}
          onChange={(e) => setValues((current) => ({ ...current, rights: e.target.value }))}
        >
          <option value="own">Propia</option>
          <option value="press">Prensa</option>
          <option value="third_party">Terceros</option>
        </select>

        <label className="admin-label" htmlFor={`media-credit-${item.id}`}>
          Crédito
        </label>
        <input
          id={`media-credit-${item.id}`}
          className="admin-input"
          maxLength={120}
          value={values.credit}
          onChange={(e) => setValues((current) => ({ ...current, credit: e.target.value }))}
        />

        <label className="admin-label" htmlFor={`media-source-${item.id}`}>
          Origen (URL)
        </label>
        <input
          id={`media-source-${item.id}`}
          className="admin-input"
          type="url"
          value={values.sourceUrl}
          onChange={(e) => setValues((current) => ({ ...current, sourceUrl: e.target.value }))}
        />

        <div className="admin-actions">
          <button
            className="admin-button admin-button-primary"
            type="button"
            disabled={busy}
            onClick={() => void save()}
          >
            Guardar
          </button>
          {item.pendingDeleteAt ? (
            <button
              className="admin-button admin-button-secondary"
              type="button"
              disabled={busy}
              onClick={() => void restore()}
            >
              Restaurar
            </button>
          ) : (
            <button
              className="admin-button admin-button-quiet"
              type="button"
              disabled={busy}
              onClick={() => void remove()}
            >
              Eliminar
            </button>
          )}
          <a
            className="admin-button admin-button-quiet"
            href={item.publicUrl}
            target="_blank"
            rel="noreferrer"
          >
            Ver original
          </a>
        </div>
        {message ? (
          <p className="admin-error" role="alert">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** Media library: metadata of every uploaded image and its deletion state. */
export function AdminMediaManager({ items }: { items: MediaRow[] }) {
  if (items.length === 0) {
    return (
      <div className="admin-empty">
        Todavía no hay imágenes. Subí la primera desde el editor de un artículo o juego.
      </div>
    );
  }
  return (
    <div className="admin-media-list">
      {items.map((item) => (
        <MediaItem item={item} key={item.id} />
      ))}
    </div>
  );
}
