'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createArticle, publishArticle, updateArticle } from '@/app/actions/content';
import { ContentImage } from '@/components/content-image';

type ArticleKind = 'review' | 'news' | 'guide';
type ArticleStatus = 'draft' | 'published';
type MediaOption = {
  id: number;
  publicUrl: string;
  width: number;
  height: number;
  alt: string | null;
};
type GameOption = { id: number; title: string };
type EditorValues = {
  kind: ArticleKind;
  slug: string;
  title: string;
  description: string;
  body: string;
  author: string;
  tags: string;
  status: ArticleStatus;
  publishedAt: string | null;
  featured: boolean;
  coverMediaId: number | null;
  coverAlt: string;
  ogMediaId: number | null;
  gameId: number | null;
  score: string;
  scoreReason: string;
  verdict: string;
  category: string;
  sourceName: string;
  sourceUrl: string;
  seoTitle: string;
  seoDescription: string;
};
type Props = {
  articleId?: number;
  version?: number;
  initial: EditorValues;
  media: MediaOption[];
  games: GameOption[];
};
type Saved = { id: number; version: number };

const inputClass = 'admin-input';

/**
 * Associates validation messages with their form control.
 *
 * Every message gets a stable id so the control can point to it through
 * `aria-describedby`, and the control is marked as invalid (WCAG 3.3.1 and
 * 4.1.2).
 */
function errorProps(field: string, errors?: string[]) {
  if (!errors || errors.length === 0) return {};
  return {
    'aria-invalid': true,
    'aria-describedby': errors.map((_, index) => `${field}-error-${index}`).join(' '),
  };
}

function FieldErrors({ field, errors }: { field: string; errors?: string[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <>
      {errors.map((error, index) => (
        <small
          className="admin-error"
          id={`${field}-error-${index}`}
          key={`${field}-error-${index}`}
        >
          {error}
        </small>
      ))}
    </>
  );
}

const defaultValues: EditorValues = {
  kind: 'news',
  slug: '',
  title: '',
  description: '',
  body: '',
  author: '',
  tags: '',
  status: 'draft',
  publishedAt: null,
  featured: false,
  coverMediaId: null,
  coverAlt: '',
  ogMediaId: null,
  gameId: null,
  score: '',
  scoreReason: '',
  verdict: '',
  category: '',
  sourceName: '',
  sourceUrl: '',
  seoTitle: '',
  seoDescription: '',
};

export function AdminArticleForm({
  articleId,
  version: initialVersion,
  initial,
  media: initialMedia,
  games,
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<EditorValues>({ ...defaultValues, ...initial });
  const [mediaItems, setMediaItems] = useState(initialMedia);
  const [id, setId] = useState(articleId);
  const [version, setVersion] = useState(initialVersion ?? 1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('success');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [bodyImageId, setBodyImageId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const focusErrorsRef = useRef(false);

  // Move focus to the first invalid control after a failed save (WCAG 3.3.1).
  // The flag avoids stealing focus every time the user clears one field error.
  useEffect(() => {
    if (!focusErrorsRef.current) return;
    focusErrorsRef.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fieldErrors]);

  function insertBodyImage() {
    const item = mediaItems.find((candidate) => candidate.id === bodyImageId);
    if (!item) return;
    const alt = item.alt?.trim() || `Imagen ${item.id}`;
    const snippet = `\n\n![${alt}](media:${item.id})\n\n`;
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? values.body.length;
    const end = textarea?.selectionEnd ?? start;
    change('body', values.body.slice(0, start) + snippet + values.body.slice(end));
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function change<K extends keyof EditorValues>(key: K, value: EditorValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: [] }));
  }

  function payload(status: ArticleStatus) {
    return {
      ...values,
      status,
      tags: values.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      score: values.kind === 'review' && values.score ? Number(values.score) : null,
      gameId: values.kind === 'review' ? values.gameId : null,
      scoreReason: values.kind === 'review' ? values.scoreReason || null : null,
      verdict: values.kind === 'review' ? values.verdict || null : null,
      category: values.kind === 'news' ? values.category || null : null,
      sourceName: values.kind === 'news' ? values.sourceName || null : null,
      sourceUrl: values.kind === 'news' ? values.sourceUrl || null : null,
      author: values.author || null,
      coverMediaId: values.coverMediaId,
      coverAlt: values.coverMediaId ? values.coverAlt : null,
      ogMediaId: values.ogMediaId,
      seoTitle: values.seoTitle || null,
      seoDescription: values.seoDescription || null,
      publishedAt:
        status === 'published'
          ? (values.publishedAt ?? new Date().toISOString())
          : values.publishedAt,
    };
  }

  async function persist(status: ArticleStatus): Promise<Saved | null> {
    setMessage('');
    setFieldErrors({});
    const input = payload(status);
    if (id) {
      const result = await updateArticle({ id, version, input });
      if (!result.ok) {
        setMessageTone('error');
        setMessage(result.message);
        focusErrorsRef.current = true;
        setFieldErrors(result.fieldErrors ?? {});
        return null;
      }
      setVersion(result.data.version);
      return { id, version: result.data.version };
    }
    const result = await createArticle(input);
    if (!result.ok) {
      setMessageTone('error');
      setMessage(result.message);
      focusErrorsRef.current = true;
      setFieldErrors(result.fieldErrors ?? {});
      return null;
    }
    setId(result.data.id);
    setVersion(result.data.version);
    return { id: result.data.id, version: result.data.version };
  }

  async function save(status: ArticleStatus) {
    setBusy(true);
    try {
      const saved = await persist(status);
      if (!saved) return;
      router.replace('/admin/articles/' + saved.id);
      router.refresh();
      setMessageTone('success');
      setMessage(status === 'published' ? 'Cambios guardados.' : 'Borrador guardado.');
    } catch {
      setMessageTone('error');
      setMessage('No se pudo guardar el artículo.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      const saved = await persist('draft');
      if (!saved) return;
      const result = await publishArticle(saved);
      if (!result.ok) {
        setMessageTone('error');
        setMessage(result.message);
        focusErrorsRef.current = true;
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setValues((current) => ({
        ...current,
        status: 'published',
        publishedAt: current.publishedAt ?? new Date().toISOString(),
      }));
      setVersion(result.data.version);
      setMessageTone('success');
      setMessage('Artículo publicado.');
      router.replace('/admin/articles/' + saved.id);
      router.refresh();
    } catch {
      setMessageTone('error');
      setMessage('No se pudo publicar el artículo.');
    } finally {
      setBusy(false);
    }
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
          bytes: number;
          contentType: string;
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
      change('coverAlt', values.title || 'Imagen de portada');
      setMessageTone('success');
      setMessage('Imagen subida y seleccionada.');
    } catch {
      setMessageTone('error');
      setMessage('Error de red al subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  const selectedMedia = mediaItems.find((item) => item.id === values.coverMediaId);

  return (
    <form
      ref={formRef}
      className="admin-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save(values.status);
      }}
    >
      <div className="admin-editor-top">
        <div>
          <p className="admin-eyebrow">{id ? 'EDICIÓN / ' + id : 'NUEVA PUBLICACIÓN'}</p>
          <h1>{id ? 'Editar artículo' : 'Crear artículo'}</h1>
        </div>
        <span className={'admin-status admin-status-' + values.status}>
          {values.status === 'published' ? 'Publicado' : 'Borrador'}
        </span>
      </div>

      <div className="admin-form-grid">
        <section className="admin-panel admin-fields">
          <label className="admin-label" htmlFor="kind">
            Tipo
          </label>
          <select
            id="kind"
            className={inputClass}
            value={values.kind}
            disabled={Boolean(id)}
            onChange={(e) => change('kind', e.target.value as ArticleKind)}
          >
            <option value="news">Noticia</option>
            <option value="review">Reseña</option>
            <option value="guide">Guía</option>
          </select>

          <label className="admin-label" htmlFor="title">
            Título
          </label>
          <input
            id="title"
            className={inputClass}
            value={values.title}
            maxLength={120}
            onChange={(e) => change('title', e.target.value)}
            {...errorProps('title', fieldErrors.title)}
          />
          <FieldErrors field="title" errors={fieldErrors.title} />

          <label className="admin-label" htmlFor="slug">
            Slug
          </label>
          <input
            id="slug"
            className={inputClass}
            value={values.slug}
            placeholder="mi-articulo"
            onChange={(e) => change('slug', e.target.value)}
            {...errorProps('slug', fieldErrors.slug)}
          />
          <FieldErrors field="slug" errors={fieldErrors.slug} />

          <label className="admin-label" htmlFor="description">
            Bajada
          </label>
          <textarea
            id="description"
            className={inputClass}
            rows={3}
            maxLength={240}
            value={values.description}
            onChange={(e) => change('description', e.target.value)}
          />

          <label className="admin-label" htmlFor="body">
            Contenido (Markdown)
          </label>
          <textarea
            id="body"
            ref={bodyRef}
            className={inputClass + ' admin-body-input'}
            rows={18}
            value={values.body}
            onChange={(e) => change('body', e.target.value)}
            {...errorProps('body', fieldErrors.body)}
          />
          <FieldErrors field="body" errors={fieldErrors.body} />

          <label className="admin-label" htmlFor="body-image">
            Insertar imagen en el contenido
          </label>
          <select
            id="body-image"
            className={inputClass}
            value={bodyImageId ?? ''}
            onChange={(e) => setBodyImageId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Elegir imagen</option>
            {mediaItems.map((item) => (
              <option value={item.id} key={item.id}>
                #{item.id} · {item.alt || `${item.width}×${item.height}`}
              </option>
            ))}
          </select>
          <button
            className="admin-button admin-button-secondary"
            type="button"
            onClick={insertBodyImage}
            disabled={bodyImageId === null}
          >
            Insertar referencia
          </button>

          <label className="admin-label" htmlFor="author">
            Autor
          </label>
          <input
            id="author"
            className={inputClass}
            maxLength={60}
            value={values.author}
            onChange={(e) => change('author', e.target.value)}
          />

          <label className="admin-label" htmlFor="tags">
            Etiquetas (separadas por coma)
          </label>
          <input
            id="tags"
            className={inputClass}
            value={values.tags}
            onChange={(e) => change('tags', e.target.value)}
            placeholder="rpg, accion, indie"
            {...errorProps('tags', fieldErrors.tags)}
          />
          <FieldErrors field="tags" errors={fieldErrors.tags} />
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
              Destacar en portada
            </label>
            <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {values.status === 'draft' ? (
              <button
                className="admin-button admin-button-secondary"
                type="button"
                disabled={busy}
                onClick={() => void publish()}
              >
                Guardar y publicar
              </button>
            ) : null}
          </section>

          <section className="admin-panel">
            <h2>Portada</h2>
            <label className="admin-label" htmlFor="cover">
              Imagen
            </label>
            <select
              id="cover"
              className={inputClass}
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
                height={210}
              />
            ) : null}
            <label className="admin-label" htmlFor="cover-alt">
              Texto alternativo
            </label>
            <input
              id="cover-alt"
              className={inputClass}
              value={values.coverAlt}
              maxLength={200}
              onChange={(e) => change('coverAlt', e.target.value)}
              {...errorProps('coverAlt', fieldErrors.coverAlt)}
            />
            <FieldErrors field="coverAlt" errors={fieldErrors.coverAlt} />
            <label className="admin-label" htmlFor="upload">
              Subir imagen (máx. 2 MB)
            </label>
            <input
              id="upload"
              className={inputClass}
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
            <label className="admin-label" htmlFor="og-media">
              Imagen Open Graph
            </label>
            <select
              id="og-media"
              className={inputClass}
              value={values.ogMediaId ?? ''}
              onChange={(e) => change('ogMediaId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Usar imagen predeterminada</option>
              {mediaItems.map((item) => (
                <option value={item.id} key={item.id}>
                  #{item.id} · {item.width}×{item.height}
                </option>
              ))}
            </select>
          </section>

          {values.kind === 'review' ? (
            <section className="admin-panel">
              <h2>Datos de la reseña</h2>
              <label className="admin-label" htmlFor="game">
                Juego
              </label>
              <select
                id="game"
                className={inputClass}
                value={values.gameId ?? ''}
                onChange={(e) => change('gameId', e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Elegir juego publicado</option>
                {games.map((game) => (
                  <option value={game.id} key={game.id}>
                    {game.title}
                  </option>
                ))}
              </select>
              <label className="admin-label" htmlFor="score">
                Puntuación
              </label>
              <input
                id="score"
                className={inputClass}
                type="number"
                min={1}
                max={10}
                value={values.score}
                onChange={(e) => change('score', e.target.value)}
                {...errorProps('score', fieldErrors.score)}
              />
              <FieldErrors field="score" errors={fieldErrors.score} />
              <label className="admin-label" htmlFor="score-reason">
                Justificación
              </label>
              <textarea
                id="score-reason"
                className={inputClass}
                rows={4}
                value={values.scoreReason}
                onChange={(e) => change('scoreReason', e.target.value)}
                {...errorProps('scoreReason', fieldErrors.scoreReason)}
              />
              <FieldErrors field="scoreReason" errors={fieldErrors.scoreReason} />
              <label className="admin-label" htmlFor="verdict">
                Veredicto
              </label>
              <textarea
                id="verdict"
                className={inputClass}
                rows={3}
                value={values.verdict}
                onChange={(e) => change('verdict', e.target.value)}
                {...errorProps('verdict', fieldErrors.verdict)}
              />
              <FieldErrors field="verdict" errors={fieldErrors.verdict} />
            </section>
          ) : null}

          {values.kind === 'news' ? (
            <section className="admin-panel">
              <h2>Fuente</h2>
              <label className="admin-label" htmlFor="category">
                Categoría
              </label>
              <input
                id="category"
                className={inputClass}
                maxLength={40}
                value={values.category}
                onChange={(e) => change('category', e.target.value)}
              />
              <label className="admin-label" htmlFor="source-name">
                Nombre de la fuente
              </label>
              <input
                id="source-name"
                className={inputClass}
                maxLength={120}
                value={values.sourceName}
                onChange={(e) => change('sourceName', e.target.value)}
              />
              <label className="admin-label" htmlFor="source-url">
                URL de la fuente
              </label>
              <input
                id="source-url"
                className={inputClass}
                type="url"
                value={values.sourceUrl}
                onChange={(e) => change('sourceUrl', e.target.value)}
              />
            </section>
          ) : null}

          <section className="admin-panel">
            <h2>SEO</h2>
            <label className="admin-label" htmlFor="seo-title">
              Título SEO
            </label>
            <input
              id="seo-title"
              className={inputClass}
              maxLength={70}
              value={values.seoTitle}
              onChange={(e) => change('seoTitle', e.target.value)}
            />
            <label className="admin-label" htmlFor="seo-description">
              Descripción SEO
            </label>
            <textarea
              id="seo-description"
              className={inputClass}
              rows={3}
              maxLength={160}
              value={values.seoDescription}
              onChange={(e) => change('seoDescription', e.target.value)}
            />
          </section>
        </aside>
      </div>

      {message ? (
        <p
          className={messageTone === 'error' ? 'admin-error' : 'admin-notice'}
          role={messageTone === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
      <div className="admin-editor-bottom">
        <button className="admin-button admin-button-primary" type="submit" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {values.status === 'draft' ? (
          <button
            className="admin-button admin-button-secondary"
            type="button"
            disabled={busy}
            onClick={() => void publish()}
          >
            Guardar y publicar
          </button>
        ) : null}
        <Link className="admin-button admin-button-quiet" href="/admin">
          Volver a artículos
        </Link>
      </div>
    </form>
  );
}

export const emptyArticleValues = defaultValues;
