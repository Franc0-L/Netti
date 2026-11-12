import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { ContentImage } from '@/components/content-image';
import type { BodyMedia } from '@/lib/content';

const MEDIA_PREFIX = 'media:';

// Markdown images reference stored media as `media:<id>`. The sanitizer must
// allow that scheme so the custom renderer receives the identifier; the
// identifier is then resolved against trusted server data, never against an
// arbitrary URL supplied by the Markdown source.
const sanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'media'],
  },
};

type MarkdownContentProps = {
  source: string;
  media?: Record<number, BodyMedia>;
};

export function MarkdownContent({ source, media = {} }: MarkdownContentProps) {
  const components: Components = {
    a: ({ href, children }) => {
      const external = href?.startsWith('https://') || href?.startsWith('http://');
      return (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer nofollow' : undefined}
        >
          {children}
          {external ? (
            <span className="visually-hidden"> (se abre en una nueva ventana)</span>
          ) : null}
        </a>
      );
    },
    img: ({ src, alt, title }) => {
      if (typeof src === 'string' && src.startsWith(MEDIA_PREFIX)) {
        const id = Number(src.slice(MEDIA_PREFIX.length));
        const item = Number.isSafeInteger(id) ? media[id] : undefined;
        if (!item) return null;
        return (
          <ContentImage
            src={item.publicUrl}
            alt={alt || item.alt || ''}
            width={item.width}
            height={item.height}
            sizes="(max-width: 720px) 100vw, 720px"
            variants={item.variants}
          />
        );
      }

      // Images that are not stored in media keep their original URL. The CSP
      // and the sanitizer still restrict the allowed protocols.
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={typeof src === 'string' ? src : undefined}
          alt={alt ?? ''}
          title={title}
          loading="lazy"
          decoding="async"
        />
      );
    },
  };

  return (
    <div className="article-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
        urlTransform={(url) => (url.startsWith(MEDIA_PREFIX) ? url : defaultUrlTransform(url))}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
