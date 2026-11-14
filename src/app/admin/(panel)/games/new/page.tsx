import { desc, isNull } from 'drizzle-orm';
import { db } from '@/db/index';
import { media } from '@/db/schema';
import { AdminGameForm, emptyGameValues } from '@/components/admin-game-form';

export default async function NewGamePage() {
  const mediaItems = await db
    .select({
      id: media.id,
      publicUrl: media.publicUrl,
      width: media.width,
      height: media.height,
      alt: media.alt,
    })
    .from(media)
    .where(isNull(media.pendingDeleteAt))
    .orderBy(desc(media.createdAt))
    .limit(60);

  return <AdminGameForm status="draft" initial={emptyGameValues} media={mediaItems} />;
}
