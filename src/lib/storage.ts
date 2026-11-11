export interface StoredObject {
  key: string;
  url: string;
  /** Null when the input is a stream and its byte length is not known here. */
  bytes: number | null;
}

export interface Storage {
  put(
    key: string,
    body: ReadableStream | Blob | ArrayBuffer,
    options: {
      contentType: string;
      cacheControlMaxAge: number;
    }
  ): Promise<StoredObject>;
  del(keys: string[]): Promise<void>;
  list(args: { prefix: string; cursor?: string; limit?: number }): Promise<{
    objects: Array<{ key: string; bytes: number; uploadedAt: Date }>;
    nextCursor: string | null;
  }>;
}

export const storage: Storage = {
  async put(key, body, options) {
    const { put } = await import('@vercel/blob');
    const result = await put(key, body, {
      access: 'public',
      contentType: options.contentType,
      cacheControlMaxAge: options.cacheControlMaxAge,
      addRandomSuffix: false,
    });

    return {
      key: result.pathname,
      url: result.url,
      bytes:
        body instanceof Blob ? body.size : body instanceof ArrayBuffer ? body.byteLength : null,
    };
  },

  async del(keys) {
    if (keys.length === 0) return;
    const { del } = await import('@vercel/blob');
    await del(keys);
  },

  async list(args) {
    const { list } = await import('@vercel/blob');
    const result = await list({
      prefix: args.prefix,
      cursor: args.cursor,
      limit: args.limit,
    });

    return {
      objects: result.blobs.map((blob) => ({
        key: blob.pathname,
        bytes: blob.size,
        uploadedAt: blob.uploadedAt,
      })),
      nextCursor: result.cursor ?? null,
    };
  },
};
