export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
}

export interface Storage {
  put(
    key: string,
    body: ReadableStream | Blob | ArrayBuffer,
    options: {
      contentType: string;
      cacheControlMaxAge: number;
    },
  ): Promise<StoredObject>;
  del(keys: string[]): Promise<void>;
  list(args: { prefix: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; bytes: number; uploadedAt: Date }>;
    nextCursor: string | null;
  }>;
}

export const storage: Storage = {
  async put(key, body, options) {
    const { put } = await import("@vercel/blob");
    const result = await put(key, body, {
      access: "public",
      contentType: options.contentType,
      cacheControlMaxAge: options.cacheControlMaxAge,
      addRandomSuffix: false,
    });
    return {
      key: (result as any).key as string,
      url: result.url,
      bytes: body instanceof Blob ? body.size : 0,
    };
  },

  async del(keys) {
    const { del } = await import("@vercel/blob");
    await del(keys);
  },

  async list(args) {
    const { list } = await import("@vercel/blob");
    const result = await list({
      prefix: args.prefix,
      cursor: args.cursor,
      limit: args.limit,
    });
    return {
      objects: result.blobs.map((b: any) => ({
        key: b.key,
        bytes: b.size,
        uploadedAt: b.uploadedAt,
      })),
      nextCursor: result.cursor ?? null,
    };
  },
};
