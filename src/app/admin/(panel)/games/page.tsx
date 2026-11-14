import Link from 'next/link';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { db } from '@/db/index';
import { games } from '@/db/schema';
import { AdminGameActions } from '@/components/admin-game-actions';
import { escapeLike, firstParamText } from '@/lib/search-params';

const PAGE_SIZE = 25;
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  trashed: 'Papelera',
};
const STATUSES = ['draft', 'published', 'trashed'] as const;

type SearchParams = {
  q?: string | string[];
  estado?: string | string[];
  pagina?: string | string[];
};

export default async function AdminGamesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const search = firstParamText(query.q, 80);
  const rawStatus = firstParamText(query.estado, 16);
  const status = STATUSES.find((value) => value === rawStatus);
  const requestedPage = Number.parseInt(firstParamText(query.pagina, 8), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const conditions: SQL[] = [];
  if (search) conditions.push(ilike(games.title, `%${escapeLike(search)}%`));
  if (status) conditions.push(eq(games.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: games.id,
        slug: games.slug,
        title: games.title,
        status: games.status,
        platforms: games.platforms,
        updatedAt: games.updatedAt,
      })
      .from(games)
      .where(where)
      .orderBy(desc(games.updatedAt), desc(games.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(games).where(where),
  ]);

  const total = totalRow[0]?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const filtered = Boolean(search || status);

  const pageLink = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status) params.set('estado', status);
    if (target > 1) params.set('pagina', String(target));
    const queryString = params.toString();
    return queryString ? `/admin/games?${queryString}` : '/admin/games';
  };

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <p className="admin-eyebrow">BIBLIOTECA</p>
          <h1>Juegos</h1>
          <p className="admin-muted">
            {total} {total === 1 ? 'ficha' : 'fichas'}
            {filtered ? ' con los filtros aplicados' : ' en total'}
          </p>
        </div>
        <Link className="admin-button admin-button-primary" href="/admin/games/new">
          Crear juego
        </Link>
      </div>

      <form className="admin-filters" method="get" action="/admin/games" role="search">
        <label className="admin-label" htmlFor="game-filter-q">
          Buscar por título
        </label>
        <input
          id="game-filter-q"
          className="admin-input"
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Título del juego"
        />
        <label className="admin-label" htmlFor="game-filter-status">
          Estado
        </label>
        <select
          id="game-filter-status"
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
            <Link className="admin-button admin-button-quiet" href="/admin/games">
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="admin-empty">
          {filtered
            ? 'No hay fichas que coincidan con los filtros.'
            : 'Todavía no hay fichas. Creá la primera para empezar la biblioteca.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="visually-hidden">
              Fichas de juegos, con plataformas, estado y acciones disponibles
            </caption>
            <thead>
              <tr>
                <th scope="col">Juego</th>
                <th scope="col">Plataformas</th>
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
                    <strong>{row.title}</strong>
                    <br />
                    <span className="admin-muted">/{row.slug}</span>
                  </td>
                  <td>{row.platforms.join(', ') || '—'}</td>
                  <td>
                    <span className={'admin-status admin-status-' + row.status}>
                      {STATUS_LABEL[row.status] ?? row.status}
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
                      <Link href={'/admin/games/' + row.id}>Editar</Link>
                      <AdminGameActions
                        id={row.id}
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
        <nav className="admin-pagination" aria-label="Páginas de juegos">
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
