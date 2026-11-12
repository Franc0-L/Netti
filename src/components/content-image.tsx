import Image, { type ImageProps } from 'next/image';

type ImageVariant = { width: number; publicUrl: string };
type ContentImageProps = Omit<ImageProps, 'alt'> & {
  alt: string;
  /** Pre-generated WebP variants. When present, a responsive <img> is rendered. */
  variants?: ImageVariant[];
};

/**
 * Renders an already optimized stored image.
 *
 * Netti pre-generates WebP variants with sharp and does not use Vercel's
 * on-demand image transformations, so the loader is explicitly disabled.
 * When variants are available they are exposed through `srcSet`, which lets
 * the browser pick a smaller file without any transformation at request time.
 */
export function ContentImage({ alt, variants, ...props }: ContentImageProps) {
  if (variants && variants.length > 0) {
    const { src, width, height, sizes, className } = props;
    const srcSet = variants.map((variant) => `${variant.publicUrl} ${variant.width}w`).join(', ');
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={String(src)}
        srcSet={srcSet}
        sizes={sizes}
        width={typeof width === 'number' ? width : undefined}
        height={typeof height === 'number' ? height : undefined}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <Image {...props} alt={alt} unoptimized />;
}
