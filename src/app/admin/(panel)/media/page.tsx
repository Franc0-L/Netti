import Link from 'next/link';
import { desc, isNotNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { media } from '@/db/schema';
import { AdminMediaManager } from '@/components/admin-media-manager';
import { firstParamText } from '@/lib/search-params';

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  const query = await searchParams;
  const onlyMarked = firstParamText(query.estado, 16) === 'marcadas';

  const items = await db
    .select({
      id: media.id,
      publicUrl: media.publicUrl,
      width: media.width,
      height: media.height,
      alt: media.alt,
      credit: media.credit,
      rights: media.rights,
      sourceUrl: media.sourceUrl,
      pendingDeleteAt: media.pendingDeleteAt,
      createdAt: media.createdAt,
    })
    .from(media)
    .where(onlyMarked ? isNotNull(media.pendingDeleteAt) : undefined)
    .orderBy(desc(media.createdAt))
    .limit(100);

  return (
    <>
      <div className="admin-toolbar">
        <div>
          <p className="admin-eyebrow">BIBLIOTECA DE IMÁGENES</p>
          <h1>Medios</h1>
          <p className="admin-muted">
            {items.length} {items.length === 1 ? 'imagen' : 'imágenes'} en esta vista. Las marcadas
            se eliminan a las 24 horas si nadie las usa.
          </p>
        </div>
      </div>

      <nav className="admin-filters" aria-label="Filtrar medios">
        <Link
          className="admin-button admin-button-quiet"
          href="/admin/media"
          aria-current={onlyMarked ? undefined : 'page'}
        >
          Todas
        </Link>
        <Link
          className="admin-button admin-button-quiet"
          href="/admin/media?estado=marcadas"
          aria-current={onlyMarked ? 'page' : undefined}
        >
          Marcadas para eliminación
        </Link>
      </nav>

      <AdminMediaManager items={items} />
    </>
  );
}
