/**
 * Video embedding.
 *
 * The editorial form accepts any http(s) URL, but only known providers can be
 * embedded safely. Everything else is rendered as an external link, so an
 * arbitrary URL never becomes an iframe.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0] ?? '';
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v') ?? '';
    return YOUTUBE_ID.test(id) ? id : null;
  }
  const match = /^\/(?:embed|shorts)\/([^/]+)\/?$/.exec(url.pathname);
  return match && YOUTUBE_ID.test(match[1]) ? match[1] : null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const match = /^\/(?:video\/)?(\d+)\/?$/.exec(url.pathname);
  return match && VIMEO_ID.test(match[1]) ? match[1] : null;
}

/**
 * Returns a privacy-friendly embed URL for a known provider, or `null` when
 * the video has to be linked instead of embedded.
 */
export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const youtube = youtubeId(url);
  if (youtube) return `https://www.youtube-nocookie.com/embed/${youtube}`;

  const vimeo = vimeoId(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo}`;

  return null;
}
