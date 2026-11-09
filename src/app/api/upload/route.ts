import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/db/index.js";
import { media, mediaVariants, storageOrphans } from "@/db/schema.js";
import { assertSameOrigin, requireSession } from "@/lib/auth.js";
import { processImage, UPLOAD_MAX_BYTES } from "@/lib/images.js";
import { storage } from "@/lib/storage.js";

export const runtime = "nodejs";
export const maxDuration = 10;
function toArrayBuffer(value: Buffer): ArrayBuffer { return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer; }
function errorResponse(status: number, error: string) { return NextResponse.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin") ?? (request.headers.get("referer") ? new URL(request.headers.get("referer")!).origin : undefined);
    assertSameOrigin(origin);
    await requireSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return errorResponse(message.includes("Origen") ? 403 : 401, message.includes("Origen") ? "Origen no permitido." : "Sesión no válida.");
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > UPLOAD_MAX_BYTES + 128 * 1024) return errorResponse(413, "La imagen debe pesar como máximo 2 MB.");
  let form: FormData;
  try { form = await request.formData(); } catch { return errorResponse(400, "Formulario inválido."); }
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse(400, "Falta el archivo de imagen.");
  if (file.size < 1 || file.size > UPLOAD_MAX_BYTES) return errorResponse(413, "La imagen debe pesar como máximo 2 MB.");

  let output: Awaited<ReturnType<typeof processImage>>;
  try { output = await processImage(Buffer.from(await file.arrayBuffer()), file.type); }
  catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "IMAGE_TOO_LARGE") return errorResponse(413, "La imagen debe pesar como máximo 2 MB.");
    if (code === "IMAGE_TYPE_MISMATCH") return errorResponse(415, "Formato no permitido o MIME incorrecto. Usá JPEG, PNG, WebP o AVIF.");
    if (code.includes("PIXELS") || code.includes("DIMENSIONS")) return errorResponse(422, "La imagen supera las dimensiones permitidas.");
    return errorResponse(422, "No se pudo decodificar la imagen.");
  }

  const folder = randomUUID();
  const objects = [
    { key: folder + "/original.webp", bytes: output.master.bytes, width: output.master.width, height: output.master.height, original: true },
    ...output.variants.map((item) => ({ key: folder + "/" + item.width + ".webp", bytes: item.bytes, width: item.width, height: item.height, original: false })),
  ];
  const uploaded: Array<{ key: string; url: string; bytes: number; width: number; height: number; original: boolean }> = [];
  try {
    for (const object of objects) {
      const stored = await storage.put(object.key, toArrayBuffer(object.bytes), { contentType: "image/webp", cacheControlMaxAge: 31_536_000 });
      uploaded.push({ key: stored.key, url: stored.url, bytes: object.bytes.byteLength, width: object.width, height: object.height, original: object.original });
    }
    const created = await db.transaction(async (tx) => {
      const master = uploaded[0];
      const [record] = await tx.insert(media).values({ storageKey: master.key, publicUrl: master.url, width: master.width, height: master.height, bytes: master.bytes, contentType: "image/webp", rights: "own" }).returning();
      if (!record) throw new Error("MEDIA_INSERT_FAILED");
      const variants = uploaded.slice(1);
      if (variants.length > 0) {
        await tx.insert(mediaVariants).values(variants.map((item) => ({ mediaId: record.id, width: item.width, storageKey: item.key, publicUrl: item.url, bytes: item.bytes })));
      }
      return record;
    });
    return NextResponse.json({ ok: true, data: { mediaId: created.id, publicUrl: created.publicUrl, width: created.width, height: created.height, bytes: created.bytes, contentType: created.contentType, variants: uploaded.slice(1).map(({ width, url, bytes }) => ({ width, url, bytes })) } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try { await storage.del(uploaded.map((item) => item.key)); }
    catch {
      for (const item of uploaded) { try { await db.insert(storageOrphans).values({ storageKey: item.key, action: "put", status: "pending" }); } catch { /* retain the primary failure */ } }
    }
    return errorResponse(500, "No se pudo guardar la imagen.");
  }
}
