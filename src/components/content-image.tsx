import Image, { type ImageProps } from 'next/image';

type ContentImageProps = Omit<ImageProps, 'alt'> & { alt: string };

/**
 * Renders an already optimized stored image.
 *
 * Netti pre-generates WebP variants with sharp and does not use Vercel's
 * on-demand image transformations, so the loader is explicitly disabled.
 */
export function ContentImage({ alt, ...props }: ContentImageProps) {
  return <Image {...props} alt={alt} unoptimized />;
}
