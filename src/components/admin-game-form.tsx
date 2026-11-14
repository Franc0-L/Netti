'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createGame, updateGame } from '@/app/actions/games';
import { AdminGameActions } from '@/components/admin-game-actions';
import { ContentImage } from '@/components/content-image';

type MediaOption = {
  id: number;
  publicUrl: string;
  width: number;
  height: number;
  alt: string | null;
};

export type GameEditorValues = {
  slug: string;
  title: string;
  description: string;
  body: string;
  developer: string;
  publisher: string;
  /** ISO date (`AAAA-MM-DD`) or an empty string. */
  releaseDate: string;
  platforms: string;
  genres: string;
  tags: string;
  featured: boolean;
  coverMediaId: number | null;
  coverAlt: string;
};

type Props = {
  gameId?: number;
  status: 'draft' | 'published' | 'trashed';
  initial: GameEditorValues;
  media: MediaOption[];
};

export const emptyGameValues: GameEditorValues = {
  slug: '',
  title: '',
  description: '',
  body: '',
  developer: '',
  publisher: '',
  releaseDate: '',
  platforms: '',
  genres: '',
  tags: '',
  featured: false,
  coverMediaId: null,
  coverAlt: '',
};

const statusLabel: Record<Props['status'], string> = {
  draft: 'Borrador',
  published: 'Publicado',
  trashed: 'Papelera',
};

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Game sheet editor: metadata, cover and publication state. */
export function AdminGameForm({
  gameId,
  status: initialStatus,
  initial,
  media: initialMedia,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<GameEditorValues>({ ...emptyGameValues, ...initial });
  const [mediaItems, setMediaItems] = useState(initialMedia);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('success');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // The lifecycle buttons live inside the form but act on the server. When the
  // page refresh brings a new status, the form adopts the server snapshot so
  // the pending action stops being offered.
  const syncedStatusRef = useRef(initialStatus);
  useEffect(() => {
    if (syncedStatusRef.current === initialStatus) return;
    syncedStatusRef.current = initialStatus;
    setStatus(initialStatus);
    setValues({ ...emptyGameValues, ...initial });
    setFieldErrors({});
  }, [initialStatus, initial]);

  function change<K extends keyof GameEditorValues>(key: K, value: GameEditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: [] }));
  }

  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      const form = new FormData();
      form.set('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: {
          mediaId: number;
          publicUrl: string;
          width: number;
          height: number;
        };
      };
      if (!response.ok || !result.ok || !result.data) {
        setMessageTone('error');
        setMessage(result.error ?? 'No se pudo subir la imagen.');
        return;
      }
      const item = {
        id: result.data.mediaId,
        publicUrl: result.data.publicUrl,
        width: result.data.width,
        height: result.data.height,
        alt: null,
      };
      setMediaItems((current) => [item, ...current]);
      change('coverMediaId', item.id);
      change('coverAlt', values.title || 'Portada del juego');
      setMessageTone('success');
      setMessage('Imagen subida y seleccionada como portada.');
    } catch {
      setMessageTone('error');
      setMessage('Error de red al subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  function payload() {
    return {
      slug: values.slug,
      title: values.title,
      description: values.description,
      body: values.body,
      developer: values.developer || null,
      publisher: values.publisher || null,
      releaseDate: values.releaseDate || null,
      platforms: splitList(values.platforms),
      genres: splitList(values.genres),
      tags: splitList(values.tags),
      featured: values.featured,
      coverMediaId: values.coverMediaId,
      coverAlt: values.coverMediaId ? values.coverAlt : null,
      status,
    };
  }

  async function save() {
    setBusy(true);
    setMessage('');
    setFieldErrors({});
    try {
      if (!gameId) {
        const result = await createGame(payload());
        if (!result.ok) {
          setMessageTone('error');
          setMessage(result.message);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        router.replace('/admin/games/' + result.data.id);
        router.refresh();
        return;
      }
      const result = await updateGame({ id: gameId, input: payload() });
      if (!result.ok) {
        setMessageTone('error');
        setMessage(result.message);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setStatus(result.data.status as Props['status']);
      setMessageTone('success');
      setMessage('Ficha guardada.');
      router.refresh();
    } catch {
      setMessageTone('error');
      setMessage('No se pudo guardar la ficha.');
    } finally {
      setBusy(false);
    }
  }

  const selectedMedia = mediaItems.find((item) => item.id === values.coverMediaId);

  return (
    <form
      className="admin-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="admin-editor-top">
        <div>
          <p className="admin-eyebrow">{gameId ? 'FICHA / ' + gameId : 'NUEVA FICHA'}</p>
          <h1>{gameId ? 'Editar juego' : 'Crear juego'}</h1>
        </div>
        <span className={'admin-status admin-status-' + status}>{statusLabel[status]}</span>
      </div>

      <div className="admin-form-grid">
        <section className="admin-panel admin-fields">
          <label className="admin-label" htmlFor="game-title">
            Título
          </label>
          <input
            id="game-title"
            className="admin-input"
            value={values.title}
            maxLength={120}
            onChange={(e) => change('title', e.target.value)}
            aria-invalid={fieldErrors.title ? true : undefined}
          />
          {fieldErrors.title?.map((error, index) => (
            <small className="admin-error" key={`title-${index}`}>
              {error}
            </small>
          ))}

          <label className="admin-label" htmlFor="game-slug">
            Slug
          </label>
          <input
            id="game-slug"
            className="admin-input"
            value={values.slug}
            placeholder="nombre-del-juego"
            onChange={(e) => change('slug', e.target.value)}
            aria-invalid={fieldErrors.slug ? true : undefined}
          />
          {fieldErrors.slug?.map((error, index) => (
            <small className="admin-error" key={`slug-${index}`}>
              {error}
            </small>
          ))}

          <label className="admin-label" htmlFor="game-description">
            Bajada
          </label>
          <textarea
            id="game-description"
            className="admin-input"
            rows={3}
            maxLength={240}
            value={values.description}
            onChange={(e) => change('description', e.target.value)}
          />

          <label className="admin-label" htmlFor="game-body">
            Ficha (Markdown)
          </label>
          <textarea
            id="game-body"
            className="admin-input admin-body-input"
            rows={14}
            value={values.body}
            onChange={(e) => change('body', e.target.value)}
          />

          <label className="admin-label" htmlFor="game-developer">
            Desarrollador
          </label>
          <input
            id="game-developer"
            className="admin-input"
            maxLength={80}
            value={values.developer}
            onChange={(e) => change('developer', e.target.value)}
          />

          <label className="admin-label" htmlFor="game-publisher">
            Distribuidor
          </label>
          <input
            id="game-publisher"
            className="admin-input"
            maxLength={80}
            value={values.publisher}
            onChange={(e) => change('publisher', e.target.value)}
          />

          <label className="admin-label" htmlFor="game-release">
            Fecha de lanzamiento
          </label>
          <input
            id="game-release"
            className="admin-input"
            type="date"
            value={values.releaseDate}
            onChange={(e) => change('releaseDate', e.target.value)}
            aria-invalid={fieldErrors.releaseDate ? true : undefined}
          />
          {fieldErrors.releaseDate?.map((error, index) => (
            <small className="admin-error" key={`release-${index}`}>
              {error}
            </small>
          ))}

          <label className="admin-label" htmlFor="game-platforms">
            Plataformas (separadas por coma)
          </label>
          <input
            id="game-platforms"
            className="admin-input"
            value={values.platforms}
            placeholder="PC, PlayStation 5, Xbox Series X"
            onChange={(e) => change('platforms', e.target.value)}
            aria-invalid={fieldErrors.platforms ? true : undefined}
          />
          {fieldErrors.platforms?.map((error, index) => (
            <small className="admin-error" key={`platforms-${index}`}>
              {error}
            </small>
          ))}

          <label className="admin-label" htmlFor="game-genres">
            Géneros (separados por coma)
          </label>
          <input
            id="game-genres"
            className="admin-input"
            value={values.genres}
            placeholder="RPG, Aventura"
            onChange={(e) => change('genres', e.target.value)}
          />

          <label className="admin-label" htmlFor="game-tags">
            Etiquetas (separadas por coma)
          </label>
          <input
            id="game-tags"
            className="admin-input"
            value={values.tags}
            placeholder="indie, narrativo"
            onChange={(e) => change('tags', e.target.value)}
          />
          <p className="admin-muted">
            Las etiquetas conectan la ficha con las publicaciones relacionadas.
          </p>
        </section>

        <aside className="admin-sidebar">
          <section className="admin-panel">
            <h2>Publicación</h2>
            <label className="admin-check">
              <input
                type="checkbox"
                checked={values.featured}
                onChange={(e) => change('featured', e.target.checked)}
              />{' '}
              Destacar en la biblioteca
            </label>
            <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar ficha'}
            </button>
            {gameId && status !== 'trashed' ? (
              <AdminGameActions id={gameId} status={status} />
            ) : null}
          </section>

          <section className="admin-panel">
            <h2>Portada</h2>
            <label className="admin-label" htmlFor="game-cover">
              Imagen
            </label>
            <select
              id="game-cover"
              className="admin-input"
              value={values.coverMediaId ?? ''}
              onChange={(e) =>
                change('coverMediaId', e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">Sin portada</option>
              {mediaItems.map((item) => (
                <option value={item.id} key={item.id}>
                  #{item.id} · {item.width}×{item.height}
                </option>
              ))}
            </select>
            {selectedMedia ? (
              <ContentImage
                className="admin-preview"
                src={selectedMedia.publicUrl}
                alt={values.coverAlt || selectedMedia.alt || 'Vista previa de portada'}
                width={400}
                height={225}
              />
            ) : null}
            <label className="admin-label" htmlFor="game-cover-alt">
              Texto alternativo
            </label>
            <input
              id="game-cover-alt"
              className="admin-input"
              maxLength={200}
              value={values.coverAlt}
              onChange={(e) => change('coverAlt', e.target.value)}
              aria-invalid={fieldErrors.coverAlt ? true : undefined}
            />
            {fieldErrors.coverAlt?.map((error, index) => (
              <small className="admin-error" key={`cover-alt-${index}`}>
                {error}
              </small>
            ))}
            <label className="admin-label" htmlFor="game-upload">
              Subir portada (máx. 2 MB)
            </label>
            <input
              id="game-upload"
              className="admin-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            {uploading ? (
              <p className="admin-muted" role="status">
                Procesando y optimizando imagen…
              </p>
            ) : null}
          </section>

          {message ? (
            <p
              className={messageTone === 'error' ? 'admin-error' : 'admin-notice'}
              role={messageTone === 'error' ? 'alert' : 'status'}
            >
              {message}
            </p>
          ) : null}

          <Link className="admin-button admin-button-quiet" href="/admin/games">
            Volver a juegos
          </Link>
        </aside>
      </div>
    </form>
  );
}
