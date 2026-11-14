import { randomUUID } from 'node:crypto';
import { connection, NextResponse } from 'next/server';
import { db } from '@/db/index';
import { media, mediaVariants, storageOrphans } from '@/db/schema';
import {
  assertSameOrigin,
  OriginNotAllowedError,
  requireSession,
  SessionRequiredError,
} from '@/lib/auth';
import { processImage, UPLOAD_MAX_BYTES } from '@/lib/images';
import { logger } from '@/lib/logger';
import { storage } from '@/lib/storage';

export const maxDuration = 10;
const MAX_BODY_BYTES = UPLOAD_MAX_BYTES + 128 * 1024;
function toArrayBuffer(value: Buffer): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
function errorResponse(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}
/**
 * Reads the request body while enforcing a hard byte limit.
 *
 * Checking Content-Length is not enough: the header can be absent or wrong,
 * and `request.formData()` would parse the whole payload before the file size
 * is inspected. Reading through this helper aborts oversized bodies as soon as
 * the limit is crossed.
 */
async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

export async function POST(request: Request) {
  // cacheComponents prerenders route handlers unless they opt into a request.
  await connection();
  let origin: string | undefined;
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      origin = new URL(referer).origin;
    } catch {
      return errorResponse(403, 'Origen no permitido.');
    }
  }
  try {
    origin = request.headers.get('origin') ?? origin;
    assertSameOrigin(origin);
    // Route Handler context: an expired cookie can be removed from the response.
    await requireSession({ clearCookie: true });
  } catch (error) {
    if (error instanceof OriginNotAllowedError) {
      return errorResponse(403, 'Origen no permitido.');
    }
    if (error instanceof SessionRequiredError) {
      return errorResponse(401, 'Sesión no válida.');
    }
    logger.error('upload.authorize.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse(503, 'No se pudo verificar la sesión.');
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES)
    return errorResponse(413, 'La imagen debe pesar como máximo 2 MB.');

  let form: FormData;
  try {
    const body = await readLimitedBody(request, MAX_BODY_BYTES);
    form = await new Response(toArrayBuffer(Buffer.from(body)), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch (error) {
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
      return errorResponse(413, 'La imagen debe pesar como máximo 2 MB.');
    return errorResponse(400, 'Formulario inválido.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return errorResponse(400, 'Falta el archivo de imagen.');
  if (file.size < 1 || file.size > UPLOAD_MAX_BYTES)
    return errorResponse(413, 'La imagen debe pesar como máximo 2 MB.');

  let output: Awaited<ReturnType<typeof processImage>>;
  try {
    output = await processImage(Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'IMAGE_TOO_LARGE')
      return errorResponse(413, 'La imagen debe pesar como máximo 2 MB.');
    if (code === 'IMAGE_TYPE_MISMATCH')
      return errorResponse(
        415,
        'Formato no permitido o MIME incorrecto. Usá JPEG, PNG, WebP o AVIF.'
      );
    if (code.includes('PIXELS') || code.includes('DIMENSIONS'))
      return errorResponse(422, 'La imagen supera las dimensiones permitidas.');
    return errorResponse(422, 'No se pudo decodificar la imagen.');
  }

  const folder = randomUUID();
  const objects = [
    {
      key: folder + '/original.webp',
      bytes: output.master.bytes,
      width: output.master.width,
      height: output.master.height,
      original: true,
    },
    ...output.variants.map((item) => ({
      key: folder + '/' + item.width + '.webp',
      bytes: item.bytes,
      width: item.width,
      height: item.height,
      original: false,
    })),
  ];
  const uploaded: Array<{
    key: string;
    url: string;
    bytes: number;
    width: number;
    height: number;
    original: boolean;
  }> = [];
  try {
    for (const object of objects) {
      const stored = await storage.put(object.key, toArrayBuffer(object.bytes), {
        contentType: 'image/webp',
        cacheControlMaxAge: 31_536_000,
      });
      uploaded.push({
        key: stored.key,
        url: stored.url,
        bytes: object.bytes.byteLength,
        width: object.width,
        height: object.height,
        original: object.original,
      });
    }
    const created = await db.transaction(async (tx) => {
      const master = uploaded[0];
      const [record] = await tx
        .insert(media)
        .values({
          storageKey: master.key,
          publicUrl: master.url,
          width: master.width,
          height: master.height,
          bytes: master.bytes,
          contentType: 'image/webp',
          rights: 'own',
        })
        .returning();
      if (!record) throw new Error('MEDIA_INSERT_FAILED');
      const variants = uploaded.slice(1);
      if (variants.length > 0) {
        await tx.insert(mediaVariants).values(
          variants.map((item) => ({
            mediaId: record.id,
            width: item.width,
            storageKey: item.key,
            publicUrl: item.url,
            bytes: item.bytes,
          }))
        );
      }
      return record;
    });
    return NextResponse.json(
      {
        ok: true,
        data: {
          mediaId: created.id,
          publicUrl: created.publicUrl,
          width: created.width,
          height: created.height,
          bytes: created.bytes,
          contentType: created.contentType,
          variants: uploaded.slice(1).map(({ width, url, bytes }) => ({ width, url, bytes })),
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    try {
      await storage.del(uploaded.map((item) => item.key));
    } catch {
      for (const item of uploaded) {
        try {
          await db
            .insert(storageOrphans)
            .values({ storageKey: item.key, action: 'put', status: 'pending' });
        } catch {
          /* retain the primary failure */
        }
      }
    }
    logger.error('upload.failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
      uploadedObjects: uploaded.length,
    });
    return errorResponse(500, 'No se pudo guardar la imagen.');
  }
}
