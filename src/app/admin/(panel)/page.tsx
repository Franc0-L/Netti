import Link from 'next/link';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { articles } from '@/db/schema';
import { AdminArticleActions } from '@/components/admin-article-actions';
import { escapeLike, firstParamText } from '@/lib/search-params';

const PAGE_SIZE = 25;

const statusLabel: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  trashed: 'Papelera',
};
const kindLabel: Record<string, string> = { review: 'Reseña', news: 'Noticia', guide: 'Guía' };

const KINDS = ['review', 'news', 'guide'] as const;
const STATUSES = ['draft', 'published', 'trashed'] as const;

type SearchParams = {
  q?: string | string[];
  tipo?: string | string[];
  estado?: string | string[];
  pagina?: string | string[];
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const search = firstParamText(query.q, 80);
  const rawKind = firstParamText(query.tipo, 16);
  const rawStatus = firstParamText(query.estado, 16);
  const kind = KINDS.find((value) => value === rawKind);
  const status = STATUSES.find((value) => value === rawStatus);
  const requestedPage = Number.parseInt(firstParamText(query.pagina, 8), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(articles.title, `%${escapeLike(search)}%`));
  if (kind) conditions.push(eq(articles.kind, kind));
  if (status) conditions.push(eq(articles.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: articles.id,
        kind: articles.kind,
        slug: articles.slug,
        title: articles.title,
        status: articles.status,
        version: articles.version,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .where(where)
      .orderBy(desc(articles.updatedAt), desc(articles.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(articles).where(where),
  ]);

  const total = totalRow[0]?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const filtered = Boolean(search || kind || status);

  const pageLink = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (kind) params.set('tipo', kind);
    if (status) params.set('estado', status);
    if (target > 1) params.set('pagina', String(target));
    const queryString = params.toString();
    return queryString ? `/admin?${queryString}` : '/admin';
  };

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <p className="admin-eyebrow">ESCRITORIO EDITORIAL</p>
          <h1>Artículos</h1>
          <p className="admin-muted">
            {total} {total === 1 ? 'registro' : 'registros'}
            {filtered ? ' con los filtros aplicados' : ' en total'}
          </p>
        </div>
        <Link className="admin-button admin-button-primary" href="/admin/articles/new">
          Crear artículo
        </Link>
      </div>

      <form className="admin-filters" method="get" action="/admin" role="search">
        <label className="admin-label" htmlFor="filter-q">
          Buscar por título
        </label>
        <input
          id="filter-q"
          className="admin-input"
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Título del artículo"
        />
        <label className="admin-label" htmlFor="filter-kind">
          Tipo
        </label>
        <select id="filter-kind" className="admin-input" name="tipo" defaultValue={kind ?? ''}>
          <option value="">Todos</option>
          <option value="review">Reseñas</option>
          <option value="news">Noticias</option>
          <option value="guide">Guías</option>
        </select>
        <label className="admin-label" htmlFor="filter-status">
          Estado
        </label>
        <select
          id="filter-status"
          className="admin-input"
          name="estado"
          defaultValue={status ?? ''}
        >
          <option value="">Todos</option>
          <option value="draft">Borradores</option>
          <option value="published">Publicados</option>
          <option value="trashed">Papelera</option>
        </select>
        <div className="admin-actions">
          <button className="admin-button admin-button-secondary" type="submit">
            Filtrar
          </button>
          {filtered ? (
            <Link className="admin-button admin-button-quiet" href="/admin">
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="admin-empty">
          {filtered
            ? 'No hay artículos que coincidan con los filtros.'
            : 'Todavía no hay artículos. Creá el primero para empezar.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">
              Artículos, con tipo, estado, última edición y acciones disponibles
            </caption>
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                <th scope="col">Última edición</th>
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.title || 'Sin título'}</strong>
                    <br />
                    <span className="admin-muted">/{row.slug || 'sin-slug'}</span>
                  </td>
                  <td>{kindLabel[row.kind] ?? row.kind}</td>
                  <td>
                    <span className={'admin-status admin-status-' + row.status}>
                      {statusLabel[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>
                    {new Intl.DateTimeFormat('es-AR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(row.updatedAt)}
                  </td>
                  <td>
                    <div className="admin-actions">
                      {row.status !== 'trashed' ? (
                        <Link href={'/admin/articles/' + row.id}>Editar</Link>
                      ) : null}
                      <AdminArticleActions
                        id={row.id}
                        version={row.version}
                        status={row.status as 'draft' | 'published' | 'trashed'}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="admin-pagination" aria-label="Páginas de artículos">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} rel="prev">
              <span aria-hidden="true">←</span> Anteriores
            </Link>
          ) : null}
          <span className="admin-muted">
            Página {page} de {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageLink(page + 1)} rel="next">
              Siguientes <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
