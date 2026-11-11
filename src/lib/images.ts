import sharp from 'sharp';
export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_IMAGE_EDGE = 2560;
export const IMAGE_VARIANT_WIDTHS = [480, 960, 1600] as const;
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
export function detectImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp' &&
    ['avif', 'avis'].includes(String.fromCharCode(...bytes.slice(8, 12)))
  )
    return 'image/avif';
  return null;
}
export async function processImage(input: Buffer, declaredMime: string) {
  if (input.byteLength > UPLOAD_MAX_BYTES) throw new Error('IMAGE_TOO_LARGE');
  const detected = detectImageType(input);
  if (!detected || detected !== declaredMime) throw new Error('IMAGE_TYPE_MISMATCH');
  const metadata = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format)
    throw new Error('IMAGE_DIMENSIONS_INVALID');
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new Error('IMAGE_TOO_MANY_PIXELS');
  const expected = (
    {
      'image/jpeg': 'jpeg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'heif',
    } as const
  )[detected];
  if (metadata.format !== expected) throw new Error('IMAGE_DECODER_MISMATCH');
  const master = await sharp(input, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 84, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  const widths = IMAGE_VARIANT_WIDTHS.filter((width) => width <= master.info.width);
  const variants = await Promise.all(
    widths.map(async (width) => {
      const output = await sharp(input, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      return { width: output.info.width, bytes: output.data, height: output.info.height };
    })
  );
  return {
    master: { bytes: master.data, width: master.info.width, height: master.info.height },
    variants,
  };
}
